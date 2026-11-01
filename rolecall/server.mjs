import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { GameStore, GameError } from './lib/game.mjs';

export function createApp(env = process.env) {
  const turnUrls = (env.TURN_URLS || '').split(',').filter(u => /^turns?:[^\s]+$/.test(u));
  const voiceReady = !!(turnUrls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL && env.TURN_PROVIDER && env.TURN_RETENTION);
  const store = new GameStore({ voiceReady });
  const limits = new Map();
  const cleanup = setInterval(() => { store.sweep(); for (const [ip, r] of limits) if (Date.now() - r.start > 60000) limits.delete(ip); }, 15000);
  cleanup.unref();
  const files = new Map([
    ['/', ['index.html','text/html; charset=utf-8']], ['/style.css',['style.css','text/css']],
    ['/refinement.css',['refinement.css','text/css']], ['/app.js',['app.js','text/javascript']], ['/demo-data.js',['demo-data.js','text/javascript']], ['/favicon.svg',['favicon.svg','image/svg+xml']]
  ]);
  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    };
    const send = (status, data) => { res.writeHead(status, { ...headers, 'Content-Type':'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(req.method) || !files.has(url.pathname)) return send(404, { error: 'Not found.' });
        const [file, type] = files.get(url.pathname);
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { ...headers, 'Content-Type':type }); return res.end(req.method === 'HEAD' ? undefined : body);
      }
      const ip = req.socket.remoteAddress;
      const now = Date.now();
      if (!limits.has(ip) || now - limits.get(ip).start > 60000) limits.set(ip, { start:now, count:0 });
      if (++limits.get(ip).count > 600) return send(429, { error: 'Too many requests. Please wait a minute.' });
      if (url.pathname === '/api/config' && req.method === 'GET') return send(200, { voiceReady, relayProvider: env.TURN_PROVIDER || null, relayRetention: env.TURN_RETENTION || null, transcription: false });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(403, { error:'Cross-origin requests are not allowed.' });
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
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const code = url.searchParams.get('code');
      if (url.pathname === '/api/room' && req.method === 'GET') { const {room,player} = store.auth(code, token); return send(200, store.view(room,player)); }
      if (url.pathname === '/api/action' && req.method === 'POST') return send(200, store.action(data.code,token,data));
      if (url.pathname === '/api/relay' && req.method === 'GET') {
        const {room} = store.auth(code, token);
        if (!voiceReady || room.mode !== 'voice' || !['prep','talk'].includes(room.phase)) throw new GameError('Voice unavailable.', 503);
        return send(200, { iceServers:[{ urls:turnUrls, username:env.TURN_USERNAME, credential:env.TURN_CREDENTIAL }], iceTransportPolicy:'relay' });
      }
      send(404, { error:'Not found.' });
    } catch (error) { send(error instanceof GameError ? error.status : 500, { error:error instanceof GameError ? error.message : 'Something went wrong. Please try again.' }); }
  });
  server.requestTimeout = 15000;
  server.on('close', () => clearInterval(cleanup));
  return { server, store };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const {server} = createApp();
  server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log(`RoleCall · http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
}
