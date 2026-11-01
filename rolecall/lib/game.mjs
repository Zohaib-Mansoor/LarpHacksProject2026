import { randomBytes } from 'node:crypto';
import { characters, publicCharacter, packages, validDeal, scoreDeal, scenarioVersion, rubricVersion } from './scenario.mjs';
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const requireThat = (condition, message, status) => { if (!condition) throw new GameError(message, status); };
const token = () => randomBytes(24).toString('base64url');
export class GameStore {
  rooms = new Map();
  constructor({ now = Date.now, voiceReady = false } = {}) { this.now = now; this.voiceReady = voiceReady; }
  player(role) { return { token: token(), role, ready: false, muted: false, reveal: false, rematch: false, lastSeen: this.now(), signals: [] }; }
  create({ consent, mode }) {
    this.sweep();
    requireThat(consent === true, 'Acknowledge processing before joining.');
    requireThat(['text', 'voice'].includes(mode), 'Choose text practice or voice.');
    requireThat(mode !== 'voice' || this.voiceReady, 'Voice rooms need a configured TURN relay and operator disclosure.', 503);
    requireThat(this.rooms.size < 200, 'The room limit has been reached. Try again shortly.', 503);
    let code;
    do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
    const player = this.player('alex');
    const room = { code, mode, phase: 'waiting', created: this.now(), players: [player], messages: [], deal: null, revision: 0, accepted: [], deadline: null, endReason: null, round: 1, pauseUsed: 0, pauseStart: null, extended: false };
    this.rooms.set(code, room);
    return { token: player.token, ...this.view(room, player) };
  }
  join({ code, consent }) {
    this.sweep();
    requireThat(consent === true, 'Acknowledge processing before joining.');
    const room = this.rooms.get(String(code).toUpperCase());
    requireThat(room, 'Room not found or expired. Ask for a new invite.', 404);
    this.tick(room);
    requireThat(room.phase === 'waiting' && room.players.length === 1, 'This room already has two players or has ended.', 409);
    const player = this.player('morgan');
    room.players.push(player); room.phase = 'prep'; room.deadline = this.now() + 45000;
    return { token: player.token, ...this.view(room, player) };
  }
  auth(code, credential) {
    this.sweep();
    const room = this.rooms.get(String(code).toUpperCase());
    requireThat(room, 'This room expired. Create a new one.', 404);
    const player = room.players.find(p => p.token === credential);
    requireThat(player, 'This session cannot access the room.', 401);
    this.tick(room);
    player.lastSeen = this.now();
    if (room.pauseStart && room.players.every(p => this.now() - p.lastSeen < 6000)) {
      const used = Math.min(20000 - room.pauseUsed, this.now() - room.pauseStart);
      room.deadline += used; room.pauseUsed += used; room.pauseStart = null;
    }
    return { room, player };
  }
  finish(room, reason, phase = 'complete') {
    room.phase = phase; room.endReason = reason; room.deadline = null; room.pauseStart = null; room.expires = this.now() + 600000;
    for (const p of room.players) p.signals = [];
  }
  tick(room) {
    const now = this.now();
    if (['talk', 'finalize', 'prep'].includes(room.phase) && room.players.some(p => now - p.lastSeen > 6000)) {
      room.pauseStart ??= now;
      if (room.pauseUsed + now - room.pauseStart >= 20000) this.finish(room, 'A player disconnected. This round is incomplete.', 'incomplete');
    }
    if (room.pauseStart || !room.deadline || now < room.deadline) return;
    if (room.phase === 'prep') {
      if (!room.extended) { room.extended = true; room.deadline = now + 30000; }
      else this.finish(room, 'Both players were not ready. No score was awarded.', 'incomplete');
    } else if (room.phase === 'talk') { room.phase = 'finalize'; room.deadline = now + 45000; }
    else if (room.phase === 'finalize') this.finish(room, 'Time ended without a mutually confirmed agreement.');
  }
  action(code, credential, data) {
    const { room, player } = this.auth(code, credential);
    const peer = room.players.find(p => p !== player);
    const active = ['prep', 'talk', 'finalize'].includes(room.phase);
    if (data.type === 'leave' || data.type === 'report') {
      requireThat(!['complete','incomplete'].includes(room.phase), 'This round has already ended.', 409);
      this.finish(room, data.type === 'report' ? 'A participant ended the round using Report. No report was uploaded; no score was awarded.' : 'A player left. This round is incomplete.', 'incomplete');
    } else if (data.type === 'ready') {
      requireThat(room.phase === 'prep', 'Readiness is available during the briefing.', 409);
      player.ready = true;
      if (room.players.every(p => p.ready)) { room.phase = 'talk'; room.deadline = this.now() + 300000; }
    } else if (data.type === 'mute') {
      requireThat(active, 'This round is not active.', 409); player.muted = data.muted === true;
    } else if (data.type === 'message') {
      requireThat(room.phase === 'talk' && !room.pauseStart, 'Messages are available during the conversation.', 409);
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      requireThat(text.length > 0 && text.length <= 1000, 'Write between 1 and 1,000 characters.');
      requireThat(room.messages.length < 200, 'The transcript limit has been reached. Use the proposal to close.');
      room.messages.push({ id: room.messages.length + 1, speaker: player.role, kind: 'text', text, timestamp: this.now() });
    } else if (data.type === 'propose') {
      requireThat(['talk','finalize'].includes(room.phase) && !room.pauseStart, 'Proposals are available during negotiation.', 409);
      requireThat(validDeal(data.deal), 'Use $4.50M–$6.00M in $0.25M steps and an available delivery package.');
      room.deal = { price: data.deal.price, package: data.deal.package, proposer: player.role };
      room.revision++; room.accepted = [];
    } else if (data.type === 'confirm') {
      requireThat(['talk','finalize'].includes(room.phase) && !room.pauseStart, 'This agreement cannot be confirmed now.', 409);
      requireThat(room.deal && data.revision === room.revision, 'The proposal changed. Review the current revision before confirming.', 409);
      if (!room.accepted.includes(player.role)) room.accepted.push(player.role);
      if (room.accepted.length === 2) this.finish(room, 'Both players confirmed the same agreement.');
    } else if (data.type === 'decline') {
      requireThat(['talk','finalize'].includes(room.phase), 'There is no negotiation to decline.', 409);
      room.accepted = []; this.finish(room, 'A player declined. No agreement was reached.');
    } else if (data.type === 'reveal') {
      requireThat(room.phase === 'complete', 'Secret goals may be revealed after the round.', 409); player.reveal = data.allow === true;
    } else if (data.type === 'rematch') {
      requireThat(room.phase === 'complete', 'A rematch is available after a completed round.', 409); player.rematch = true;
      if (peer?.rematch) {
        for (const p of room.players) Object.assign(p, { role: p.role === 'alex' ? 'morgan' : 'alex', ready: false, reveal: false, rematch: false, muted: false, signals: [], lastSeen: this.now() });
        Object.assign(room, { phase: 'prep', deadline: this.now() + 45000, messages: [], deal: null, accepted: [], revision: 0, endReason: null, expires: null, extended: false, pauseUsed: 0, pauseStart: null, round: room.round + 1 });
      }
    } else if (data.type === 'signal') {
      requireThat(room.mode === 'voice' && ['prep','talk'].includes(room.phase) && peer && room.players.every(p => p.ready), 'Audio signaling is unavailable.', 409);
      requireThat(['offer','answer','ice','ack'].includes(data.kind), 'Unknown signal type.');
      if (data.kind === 'ack') player.signals = player.signals.filter(s => s.id > Number(data.through));
      else {
        requireThat(JSON.stringify(data.payload).length <= 24000 && peer.signals.length < 100, 'Signal limit reached.');
        room.signalId = (room.signalId || 0) + 1;
        peer.signals.push({ id: room.signalId, kind: data.kind, payload: data.payload });
      }
    } else throw new GameError('Unknown action.');
    return this.view(room, player);
  }
  view(room, player) {
    this.tick(room);
    const peer = room.players.find(p => p !== player);
    const reveal = room.phase === 'complete' && room.players.length === 2 && room.players.every(p => p.reveal);
    const confirmed = room.phase === 'complete' && room.accepted.length === 2;
    const scores = scoreDeal(room.deal, confirmed);
    return {
      code: room.code, mode: room.mode, phase: room.phase, round: room.round, serverNow: this.now(), deadline: room.deadline, expires: room.expires,
      paused: !!room.pauseStart, extended: room.extended, endReason: room.endReason,
      you: { ...characters[player.role], ready: player.ready, muted: player.muted, reveal: player.reveal, rematch: player.rematch },
      peer: peer ? { ...publicCharacter(peer.role), ready: peer.ready, muted: peer.muted, rematch: peer.rematch } : null,
      deal: room.deal, revision: room.revision, accepted: room.accepted, messages: room.messages, packages,
      signals: player.signals,
      result: room.phase === 'complete' ? { confirmed, scores: Object.fromEntries(Object.entries(scores).map(([id, list]) => [id, list.reduce((a,b) => a+b, 0)])), yours: scores[player.role], otherObjectives: reveal ? characters[peer.role].objectives.map((text, i) => ({ text, points: scores[peer.role][i] })) : null, coaching: 'unavailable', scenarioVersion, rubricVersion } : null
    };
  }
  sweep() {
    for (const [code, room] of this.rooms) {
      this.tick(room);
      if ((room.expires && this.now() >= room.expires) || this.now() - room.created > 3600000 || (room.phase === 'waiting' && this.now() - room.created > 900000)) this.rooms.delete(code);
    }
  }
}
