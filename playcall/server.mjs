import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve } from 'node:path';
import { GameStore, GameError } from './lib/game.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const webDistDir = resolve(here, '..', 'web', 'dist');
const publicDir = resolve(here, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SPA_PREFIXES = ['/play', '/setup', '/demo', '/room/', '/results/', '/leaderboard', '/account', '/login', '/signup', '/privacy', '/terms'];
const isSpaRoute = (pathname) =>
  pathname === '/' || SPA_PREFIXES.some(p => pathname === p || (p.endsWith('/') && pathname.startsWith(p)));

export function createApp(env = process.env) {
  const turnUrls = (env.TURN_URLS || '').split(',').filter(u => /^turns?:[^\s]+$/.test(u));
  const voiceReady = !!(turnUrls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL && env.TURN_PROVIDER && env.TURN_RETENTION);
  const store = new GameStore({ voiceReady });
  const limits = new Map();

  // Stranger FIFO queue & active sparring bots & opt-in session standings & WebRTC call signals
  let waitingMatch = null; // { code }
  const bots = new Map();  // code -> bot state
  const callSignals = new Map(); // code -> { seq, items: [{ id, from, signal }] }
  const standings = new Map(); // callsign -> { callsign, rounds, deals, points, best, updatedAt }

  const recordStanding = (callsign, points, confirmed) => {
    const clean = String(callsign || '').trim().slice(0, 28);
    if (!clean) return;
    const prev = standings.get(clean) || { callsign: clean, rounds: 0, deals: 0, points: 0, best: 0, updatedAt: Date.now() };
    prev.rounds += 1;
    if (confirmed) prev.deals += 1;
    prev.points += points;
    prev.best = Math.max(prev.best, points);
    prev.updatedAt = Date.now();
    standings.set(clean, prev);
  };

  function stepBot(code) {
    const bot = bots.get(code);
    if (!bot) return;
    const room = store.rooms.get(code);
    if (!room) { bots.delete(code); return; }
    const botPlayer = room.players.find(p => p.token === bot.token);
    const humanPlayer = room.players.find(p => p.token !== bot.token);
    if (!botPlayer || !humanPlayer) { bots.delete(code); return; }

    const now = Date.now();
    botPlayer.lastSeen = now;
    if (now < bot.nextActAt) return;

    try {
      if (room.phase === 'prep' && !botPlayer.ready) {
        store.action(code, bot.token, { type: 'ready' });
        bot.nextActAt = now + 1400;
        return;
      }

      if (room.phase === 'talk') {
        if (bot.greetedRound !== room.round) {
          bot.greetedRound = room.round;
          bot.lastSeenMsgId = room.messages.length;
          const opener = botPlayer.role === 'morgan'
            ? 'Hey Alex — glad we connected. Our investor showcase is at month 6 and our target cap is around $5.00M. What delivery structure works for Aster?'
            : 'Hi Morgan — good to meet you. Before I send terms, do you need the full satellite at month 6, or would a live month-6 demo plus full delivery at month 8 cover your showcase?';
          store.action(code, bot.token, { type: 'message', text: opener });
          bot.nextActAt = now + 1200;
          return;
        }

        // React to human proposal
        if (room.deal && room.deal.proposer !== botPlayer.role && !room.accepted.includes(botPlayer.role) && bot.handledRev !== room.revision) {
          bot.handledRev = room.revision;
          const { price, package: pkg } = room.deal;
          if (botPlayer.role === 'morgan') {
            if (pkg === 'full-8') {
              store.action(code, bot.token, { type: 'message', text: 'Waiting until month 8 leaves us with nothing for our month-6 investor presentation. Let’s switch to Staged delivery — demo at 6, full prototype at 8.' });
              store.action(code, bot.token, { type: 'propose', deal: { price: Math.min(price, 525), package: 'phased' } });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            } else if (price <= 525 || (price <= 550 && bot.counters >= 1)) {
              store.action(code, bot.token, { type: 'message', text: `${pkg === 'phased' ? 'Staged delivery hits our month-6 showcase cleanly.' : 'Month-6 delivery works for us.'} Locking in my confirmation on revision #${room.revision}.` });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            } else {
              bot.counters += 1;
              const counterPrice = price >= 575 ? 525 : 500;
              store.action(code, bot.token, { type: 'message', text: `$${(price / 100).toFixed(2)}M is above what I promised our partners. Meet at $${(counterPrice / 100).toFixed(2)}M on Staged delivery and I will sign immediately.` });
              store.action(code, bot.token, { type: 'propose', deal: { price: counterPrice, package: 'phased' } });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            }
          } else {
            // Bot is Alex (wants price >= 550, full === 8 -> phased or full-8)
            if (pkg === 'full-6') {
              store.action(code, bot.token, { type: 'message', text: 'Compressing the full build into month 6 risks hardware quality. Let’s do Staged delivery: investor demo at month 6, full prototype at month 8.' });
              store.action(code, bot.token, { type: 'propose', deal: { price: Math.max(price, 525), package: 'phased' } });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            } else if (price >= 525 || (price >= 500 && bot.counters >= 1)) {
              store.action(code, bot.token, { type: 'message', text: 'Month-8 full build gives my engineering team the runway we need. I have confirmed this revision.' });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            } else {
              bot.counters += 1;
              const counterPrice = price <= 475 ? 525 : 550;
              store.action(code, bot.token, { type: 'message', text: `At $${(price / 100).toFixed(2)}M we can’t cover testing and integration. Can we do $${(counterPrice / 100).toFixed(2)}M with Staged delivery (demo at 6, full at 8)?` });
              store.action(code, bot.token, { type: 'propose', deal: { price: counterPrice, package: 'phased' } });
              store.action(code, bot.token, { type: 'confirm', revision: room.revision });
            }
          }
          bot.lastSeenMsgId = room.messages.length;
          bot.nextActAt = now + 1200;
          return;
        }

        // React to human chat message
        const humanMsgs = room.messages.filter(m => m.id > bot.lastSeenMsgId && m.speaker !== botPlayer.role);
        if (humanMsgs.length > 0) {
          bot.lastSeenMsgId = room.messages[room.messages.length - 1].id;
          const latest = humanMsgs[humanMsgs.length - 1].text.toLowerCase();
          let reply;
          if (botPlayer.role === 'morgan') {
            if (/demo|stage|phase|split|8/.test(latest)) {
              reply = 'Truthfully, a sharp live demo at month 6 is enough for our investor showcase — waiting until month 8 for the final hardware is totally fine if the price stays reasonable. Send a proposal?';
            } else if (/5\.5|5\.75|6\.0|550|600/.test(latest)) {
              reply = 'Our target ceiling is $5.00M, though I have a little flexibility if you can guarantee a month-6 investor demo. Put an offer on the table and let’s look at it.';
            } else {
              reply = 'Our key constraint is having something convincing in front of investors at month 6 without blowing past ~$5.00M. Want to put a Staged delivery offer on the board?';
            }
          } else {
            if (/demo|6|investor|showcase|stage|phase/.test(latest)) {
              reply = 'We did a staged program on Aster-2: month-6 live demo for your investors, month-8 full prototype after final testing. Around $5.50M makes that rock solid — shall I propose it?';
            } else if (/4\.5|4\.75|5\.0/.test(latest)) {
              reply = 'Getting down to $5.00M is tight for engineering unless we keep the full prototype at month 8 via Staged delivery. Send over your best proposal and we’ll tune it.';
            } else {
              reply = 'If we stage delivery — demo at month 6, full prototype at month 8 — both teams get what they need. Feel free to send terms whenever ready.';
            }
          }
          store.action(code, bot.token, { type: 'message', text: reply });
          if (!room.deal && humanMsgs.length + bot.chatTurns >= 2) {
            const offer = botPlayer.role === 'morgan'
              ? { price: 500, package: 'phased' }
              : { price: 550, package: 'phased' };
            store.action(code, bot.token, { type: 'propose', deal: offer });
          }
          bot.chatTurns += 1;
          bot.lastSeenMsgId = room.messages.length;
          bot.nextActAt = now + 1200;
          return;
        }
      }

      if (room.phase === 'finalize' && room.deal && !room.accepted.includes(botPlayer.role)) {
        // In overtime, accept reasonable staged offers so cliffhangers can close
        const ok = botPlayer.role === 'morgan'
          ? room.deal.package !== 'full-8' && room.deal.price <= 550
          : room.deal.package !== 'full-6' && room.deal.price >= 500;
        if (ok) store.action(code, bot.token, { type: 'confirm', revision: room.revision });
      }

      if (room.phase === 'complete') {
        if (humanPlayer.reveal && !botPlayer.reveal) {
          store.action(code, bot.token, { type: 'reveal', allow: true });
        }
        if (humanPlayer.rematch && !botPlayer.rematch) {
          bot.counters = 0; bot.chatTurns = 0; bot.handledRev = 0;
          store.action(code, bot.token, { type: 'rematch' });
          bot.nextActAt = now + 1200;
        }
      }
    } catch {
      // Ignore transient phase transition races
    }
  }

  const botTicker = setInterval(() => {
    for (const code of bots.keys()) stepBot(code);
  }, 900);
  botTicker.unref();

  const cleanup = setInterval(() => {
    store.sweep();
    for (const code of bots.keys()) if (!store.rooms.has(code)) bots.delete(code);
    for (const code of callSignals.keys()) if (!store.rooms.has(code)) callSignals.delete(code);
    if (waitingMatch && !store.rooms.has(waitingMatch.code)) waitingMatch = null;
    for (const [ip, r] of limits) if (Date.now() - r.start > 60000) limits.delete(ip);
  }, 15000);
  cleanup.unref();

  const legacyFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/tokens.css', ['tokens.css', 'text/css']],
    ['/style.css', ['style.css', 'text/css']],
    ['/refinement.css', ['refinement.css', 'text/css']],
    ['/quiet.css', ['quiet.css', 'text/css']],
    ['/app.js', ['app.js', 'text/javascript']],
    ['/demo-data.js', ['demo-data.js', 'text/javascript']],
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ]);

  async function tryServeWebDist(pathname) {
    // Strictly forbid traversal, hidden files, or backend/source paths
    if (pathname.includes('..') || pathname.includes('\\') || pathname.startsWith('/.') || /^\/(lib|tests|scripts|node_modules)(\/|$)/.test(pathname)) {
      return null;
    }
    const hasDist = await stat(join(webDistDir, 'index.html')).then(s => s.isFile()).catch(() => false);
    if (!hasDist) return null;

    if (pathname === '/favicon.svg') {
      const body = await readFile(join(publicDir, 'favicon.svg')).catch(() => null);
      if (body) return { body, type: 'image/svg+xml', cache: 'public, max-age=3600' };
    }

    if (pathname.startsWith('/assets/')) {
      const target = resolve(webDistDir, pathname.slice(1));
      if (!target.startsWith(webDistDir)) return null;
      const body = await readFile(target).catch(() => null);
      if (!body) return null;
      return { body, type: MIME[extname(target)] || 'application/octet-stream', cache: 'public, max-age=31536000, immutable' };
    }

    if (isSpaRoute(pathname)) {
      const body = await readFile(join(webDistDir, 'index.html')).catch(() => null);
      if (!body) return null;
      return { body, type: 'text/html; charset=utf-8', cache: 'no-store' };
    }

    return null;
  }

  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    };
    const send = (status, data) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) return send(404, { error: 'Not found.' });
        const served = await tryServeWebDist(url.pathname);
        if (served) {
          res.writeHead(200, { ...headers, 'Cache-Control': served.cache, 'Content-Type': served.type });
          return res.end(req.method === 'HEAD' ? undefined : served.body);
        }
        if (!legacyFiles.has(url.pathname)) return send(404, { error: 'Not found.' });
        const [file, type] = legacyFiles.get(url.pathname);
        const body = await readFile(join(publicDir, file));
        res.writeHead(200, { ...headers, 'Content-Type': type });
        return res.end(req.method === 'HEAD' ? undefined : body);
      }

      const ip = req.socket.remoteAddress;
      const now = Date.now();
      if (!limits.has(ip) || now - limits.get(ip).start > 60000) limits.set(ip, { start: now, count: 0 });
      if (++limits.get(ip).count > 600) return send(429, { error: 'Too many requests. Please wait a minute.' });

      if (url.pathname === '/api/config' && req.method === 'GET') {
        return send(200, { voiceReady, relayProvider: env.TURN_PROVIDER || null, relayRetention: env.TURN_RETENTION || null, transcription: false });
      }
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        const entries = [...standings.values()]
          .sort((a, b) => b.points - a.points || b.deals - a.deals || b.updatedAt - a.updatedAt)
          .slice(0, 25);
        return send(200, { entries });
      }
      if (url.pathname === '/api/me' && req.method === 'GET') {
        return send(200, { userId: 'guest', isGuest: true });
      }

      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(403, { error: 'Cross-origin requests are not allowed.' });

      let data = {};
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Send JSON.' });
        let size = 0, chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new GameError('Request too large.', 413); chunks.push(chunk); }
        try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new GameError('Invalid JSON.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new GameError('Send a JSON object.');
      }

      if (url.pathname === '/api/rooms' && req.method === 'POST') return send(201, store.create(data));
      if (url.pathname === '/api/join' && req.method === 'POST') return send(200, store.join(data));

      // Instant FIFO Stranger Matchmaking
      if (url.pathname === '/api/match' && req.method === 'POST') {
        if (waitingMatch) {
          const queuedRoom = store.rooms.get(waitingMatch.code);
          waitingMatch = null;
          if (queuedRoom && queuedRoom.phase === 'waiting' && queuedRoom.players.length === 1) {
            const joined = store.join({ code: queuedRoom.code, consent: data.consent === true });
            return send(200, { matched: true, ...joined });
          }
        }
        const created = store.create({ consent: data.consent === true, mode: 'text' });
        waitingMatch = { code: created.code };
        return send(201, { matched: false, ...created });
      }

      // Instant Sparring Partner Room (real GameStore mechanics + reactive in-character partner)
      if (url.pathname === '/api/sparring' && req.method === 'POST') {
        const created = store.create({ consent: data.consent === true, mode: 'text' });
        const joined = store.join({ code: created.code, consent: true });
        const preferRole = data.role === 'morgan' ? 'morgan' : data.role === 'alex' ? 'alex' : (Math.random() < 0.5 ? 'alex' : 'morgan');
        const humanView = preferRole === 'alex' ? created : joined;
        const botToken = preferRole === 'alex' ? joined.token : created.token;
        bots.set(created.code, {
          token: botToken,
          nextActAt: Date.now() + 900,
          greetedRound: 0,
          lastSeenMsgId: 0,
          handledRev: 0,
          counters: 0,
          chatTurns: 0,
        });
        const { room, player } = store.auth(created.code, humanView.token);
        return send(201, { token: humanView.token, sparring: true, ...store.view(room, player) });
      }

      // Opt-in leaderboard submission from a verified completed room
      if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
        const bearer = req.headers.authorization?.replace(/^Bearer /, '');
        const { room, player } = store.auth(data.code, bearer);
        const view = store.view(room, player);
        if (!view.result) throw new GameError('Complete a round before recording standings.', 409);
        const key = `${room.code}:${room.round}:${player.role}`;
        room.recordedStandings ??= new Set();
        if (!room.recordedStandings.has(key)) {
          room.recordedStandings.add(key);
          const pts = view.result.yours.reduce((a, b) => a + b, 0);
          recordStanding(data.callsign, pts, view.result.confirmed);
        }
        const entries = [...standings.values()].sort((a, b) => b.points - a.points || b.deals - a.deals).slice(0, 25);
        return send(200, { entries });
      }

      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const code = url.searchParams.get('code');

      // Direct WebRTC audio call signaling mailbox for two-player live voice calls
      if (url.pathname === '/api/call-signal' && req.method === 'GET') {
        const { room, player } = store.auth(code, token);
        const after = Number(url.searchParams.get('after') || 0);
        const box = callSignals.get(room.code) || { seq: 0, items: [] };
        const signals = box.items.filter(item => item.id > after && item.from !== player.role);
        return send(200, { signals, cursor: box.seq });
      }
      if (url.pathname === '/api/call-signal' && req.method === 'POST') {
        const { room, player } = store.auth(data.code, token);
        if (!['prep', 'talk', 'finalize'].includes(room.phase)) throw new GameError('Call is not active.', 409);
        let box = callSignals.get(room.code);
        if (!box) { box = { seq: 0, items: [] }; callSignals.set(room.code, box); }
        box.seq += 1;
        box.items.push({ id: box.seq, from: player.role, signal: data.signal });
        if (box.items.length > 160) box.items.splice(0, box.items.length - 160);
        return send(200, { ok: true, id: box.seq });
      }

      if (url.pathname === '/api/room' && req.method === 'GET') {
        if (code && bots.has(String(code).toUpperCase())) stepBot(String(code).toUpperCase());
        const { room, player } = store.auth(code, token);
        return send(200, { sparring: bots.has(room.code), ...store.view(room, player) });
      }
      if (url.pathname === '/api/action' && req.method === 'POST') {
        if (waitingMatch && String(data.code || '').toUpperCase() === waitingMatch.code && data.type === 'leave') {
          waitingMatch = null;
        }
        const out = store.action(data.code, token, data);
        const upper = String(data.code || '').toUpperCase();
        if (bots.has(upper)) {
          const b = bots.get(upper);
          b.nextActAt = Date.now() + 950;
        }
        return send(200, { sparring: bots.has(upper), ...out });
      }
      if (url.pathname === '/api/relay' && req.method === 'GET') {
        const { room } = store.auth(code, token);
        if (!voiceReady || room.mode !== 'voice' || !['prep', 'talk'].includes(room.phase)) throw new GameError('Voice unavailable.', 503);
        return send(200, { iceServers: [{ urls: turnUrls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }], iceTransportPolicy: 'relay' });
      }
      send(404, { error: 'Not found.' });
    } catch (error) {
      send(error instanceof GameError ? error.status : 500, { error: error instanceof GameError ? error.message : 'Something went wrong. Please try again.' });
    }
  });
  server.requestTimeout = 15000;
  server.on('close', () => { clearInterval(cleanup); clearInterval(botTicker); });
  return { server, store };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { server } = createApp();
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST;
  const onListen = () => console.log(`PlayCall — http://127.0.0.1:${server.address().port}`);
  if (host) server.listen(port, host, onListen);
  else server.listen({ port, host: '::', ipv6Only: false }, onListen);
}
