const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const paths = {
  chat:'<path d="M4 4h12v10H9l-5 4V4Z"/><path d="M18 9h3v11l-5-3h-5"/>',
  brand:'<path d="M2 3h10v12H7l-5 4V3Zm12 5h8v13l-4-4h-4V8Z"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron:'<path d="m6 9 6 6 6-6"/>',
  mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  micOff:'<path d="m3 3 18 18M8 8v4a4 4 0 0 0 6.8 2.8M8.4 4.3A4 4 0 0 1 16 6v5M5 10v2a7 7 0 0 0 12 4.9M19 10v2m-7 7v3m-4 0h8"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  person:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  check:'<path d="m5 12 4 4L19 6"/>', circleCheck:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  circle:'<circle cx="12" cy="12" r="9"/>', x:'<path d="m6 6 12 12M6 18 18 6"/>',
  captions:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9H7v6h3m8-6h-3v6h3"/>',
  leave:'<path d="M9 5H4v14h5m5-14 5 5-5 5m-7-5h12"/>',
  flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  swap:'<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z"/><path d="m8 11 3 3 5-5"/>',
  edit:'<path d="m15 4 5 5-11 11H4v-5L15 4Zm-2 2 5 5"/>',
  sound:'<path d="m3 9 5 0 5-5v16l-5-5H3V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'
};
paths.moon='<path d="M20 15.2A9 9 0 0 1 8.8 4a9 9 0 1 0 11.2 11.2Z"/>';
paths.sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
const icon = (name, extra = '') => `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.circle}</svg>`;
const money = price => `$${(price / 100).toFixed(2)}M`;
const total = list => list.reduce((a,b) => a+b, 0);
const delivery = [
  {id:'phased',name:'Staged delivery',detail:'Demo at month 6 · Full prototype at month 8'},
  {id:'full-6',name:'Full prototype · month 6',detail:'One complete delivery at month 6'},
  {id:'full-8',name:'Full prototype · month 8',detail:'One complete delivery at month 8'}
];
let demoCharacters, sampleLines = [];
async function loadDemoFixtures() {
  const data=await import('/demo-data.js');demoCharacters=data.demoCharacters;sampleLines=data.sampleLines;
}
let config = {voiceReady:false,transcription:false};
let state = null;
let demo = false;
let lobbyTab = new URLSearchParams(location.search).has('room') ? 'join' : 'create';
let selectedMode = 'text';
let token = null;
let captions = true;
let demoCount = 3;
let muted = false;
let pollTimer, toastTimer;
let renderKey = '';
let pc = null, stream = null, audioContext = null, localAnalyser = null, remoteAnalyser = null, meterFrame = null;
let remoteAudio = null;
let seenSignals = new Set(), pendingIce = [], voiceRound = null, reconnectTimer = null;
let serverOffset = 0;
let lastOpener = null;
const packagedDemo = document.documentElement.dataset.standalone === 'true';
let activeTheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
try { activeTheme=localStorage.getItem('playcall-theme')||activeTheme; } catch {}
document.documentElement.dataset.theme=activeTheme;
const appearanceButton = () => `${icon(activeTheme==='dark'?'sun':'moon','small')}<span>${activeTheme==='dark'?'Light':'Dark'}</span>`;

function toast(text, error = false) {
  clearTimeout(toastTimer); const el = $('#toast'); el.textContent = text; el.hidden = false; el.classList.toggle('error-toast',error);
  toastTimer = setTimeout(() => {el.hidden = true;}, 5500);
}
function header() {
  return `<header class="header"><div class="row"><a class="brand" href="/" data-action="home" aria-label="PlayCall home"><span class="brand-mark">${icon('brand')}</span>PlayCall<span class="brand-dot">.</span></a><span class="header-note">A little less small talk.</span></div><nav class="header-nav" aria-label="Help"><button class="nav-button" data-action="how">How to play</button><button class="nav-button" data-action="rules">The rules</button><button class="nav-button theme-switch" data-action="theme" aria-label="Switch to ${activeTheme==='dark'?'light':'dark'} appearance">${appearanceButton()}</button><span class="tag outline">${icon('mic','small')} Voice-first. Camera-free.</span></nav></header>`;
}
function footer() {
  return `<footer class="footer"><span>Two people. A different point of view.</span><span>Fictional identities. Real conversations. &nbsp; <button data-action="privacy">Privacy & processing</button></span></footer>`;
}
function steps(index) {
  return `<ol class="steps" aria-label="Round progress">${['Get cast','Negotiate','Agree terms','Debrief'].map((name,i)=>`${i?'<li class="step-line" aria-hidden="true"></li>':''}<li class="step ${i===index?'active':i<index?'done':''}" ${i===index?'aria-current="step"':''}><span>${i<index?'✓':i+1}</span>${name}</li>`).join('')}</ol>`;
}
function demoBanner() {
  return demo ? `<aside class="demo-banner"><div><span class="tag">INTERACTIVE DEMO</span>Sample conversation · microphone off · no real partner</div><button data-action="exit-demo">Exit demo</button></aside>` : '';
}
function shell(content) {
  $('#app').innerHTML = `<div class="shell">${header()}${demoBanner()}${content}${footer()}</div>`;
}
function showLobby() {
  renderKey = ''; const roomCode = new URLSearchParams(location.search).get('room') || '';
  shell(`<main id="main" tabindex="-1" class="enter"><div class="lobby"><section class="lobby-copy"><p class="eyebrow">Meet someone. Become someone else.</p><h1>Two strangers.<br>One unexpected deal.</h1><p class="lobby-intro">Two people. Two secret identities.<br>Five minutes to make a deal.</p><div class="lobby-facts"><span class="row">${icon('mic')} No cameras</span><span class="row">${icon('clock')} 5-minute rounds</span><span class="row">${icon('lock')} Private goals</span></div><div class="lobby-form"><div class="tabs" role="tablist" aria-label="Room access"><button class="tab" role="tab" aria-selected="${lobbyTab==='create'}" data-action="tab-create" id="create-tab" aria-controls="lobby-panel">Create a room</button><button class="tab" role="tab" aria-selected="${lobbyTab==='join'}" data-action="tab-join" id="join-tab" aria-controls="lobby-panel">Join with a code</button></div><form id="lobby-form" class="stack" novalidate><div id="lobby-panel" role="tabpanel" aria-labelledby="${lobbyTab}-tab">${lobbyTab==='create'?`<div class="mode-options" aria-label="Room mode"><button type="button" class="mode-option" data-action="mode-text" aria-pressed="${selectedMode==='text'}"><strong>Text practice</strong><small>Ready to play · no microphone</small></button><button type="button" class="mode-option" data-action="mode-voice" aria-pressed="${selectedMode==='voice'}" ${!config.voiceReady?'disabled aria-describedby="voice-note"':''}><strong>Voice room</strong><small>${config.voiceReady?'Relay-only audio':'Relay setup needed'}</small></button></div><p id="voice-note" class="footnote" style="margin-top:10px">${config.voiceReady?'Voice is relayed through the configured operator.':'Voice rooms unlock when a TURN relay is configured. Text practice works now.'}</p>`:`<label class="form-field" for="join-code">Your six-character room code<input class="join-code" id="join-code" name="code" value="${esc(roomCode)}" placeholder="e.g. A1B2C3" minlength="6" maxlength="6" autocomplete="off" spellcheck="false" required></label>`}<label class="consent"><input id="consent" name="consent" type="checkbox" required><span>I understand the <button type="button" data-action="privacy">processing details</button>. Room text and terms are held temporarily. Voice rooms use a relay; voices and shared details may identify me. No call recording or transcription is implemented.</span></label><div id="lobby-error" class="error" role="alert"></div><button class="btn primary wide" id="join-submit" type="submit" ${packagedDemo?'disabled':''}>${lobbyTab==='create'?'Create private room':'Join the room'} ${icon('arrow')}</button><p class="footnote" style="margin-top:9px">${packagedDemo?'This CoDev Page is a standalone demo. Run the app in the Larping workspace for friend-invite rooms.':lobbyTab==='create'?'Get a temporary identity and a link to invite a friend.':'Your identity is assigned when you join. No account needed.'}</p></div></form></div></section><aside class="lobby-art" aria-label="Featured scenario"><div class="scenario-art"><span class="eyebrow">The first scenario</span><span class="art-code">SC. 001</span><div class="orbit"></div><div class="orbit second"></div><svg class="satellite" viewBox="0 0 260 200" fill="none" aria-hidden="true"><path d="m90 95 65-35 34 53-65 36-34-54Z" fill="#f5f8ff"/><path d="m90 95 34 54-12 27-39-60 17-21Z" fill="#a4befa"/><path d="m155 60 34 53 14-25-35-52-13 24Z" fill="#d1dfff"/><path d="m90 95-47 25-29-45 47-26 29 46Z" fill="#8daffa" stroke="#c8d9ff"/><path d="m189 113 48-26 18 29-48 26-18-29Z" fill="#8daffa" stroke="#c8d9ff"/><path d="m33 64 29 45m-4-60 29 45M21 85l46-25m-37 40 46-25m122 53 47-25m-33 38-18-28m36 18-18-29" stroke="#d1e0ff"/><path d="m139 139 10 18m-3-2c-4 12 6 24 19 21l-19-21Z" fill="#d1dfff"/><path d="m159 165 21-9" stroke="white" stroke-width="2"/><circle cx="184" cy="154" r="3" fill="white"/><path d="m177 141 8-4m-14-5 10-9" stroke="#a4befa"/><circle cx="216" cy="42" r="3" fill="#ffbf91"/><path d="M36 164v12m-6-6h12" stroke="#b6ccff"/></svg><span class="orbital-label">ASTER AEROSPACE × MERIDIAN VENTURES</span></div><div class="scenario-caption"><span class="eyebrow muted">A deal with a little gravity.</span><h2>The Satellite Deal</h2><p>An engineer needs time. A client has a deadline.<br>There’s a deal in here somewhere. Find it.</p><div class="cast-row"><div class="cast-person"><span class="mini-avatar">A</span><div><strong>The engineer</strong><small>Aster Aerospace</small></div></div>${icon('swap','small')}<div class="cast-person"><span class="mini-avatar other">M</span><div><strong>The client</strong><small>Meridian Ventures</small></div></div></div></div><button class="demo-link" data-action="demo"><span><strong>Take the demo for a spin</strong><small>Sample dialogue. Real deal arithmetic. No mic needed.</small></span>${icon('arrow')}</button></aside></div><div class="lobby-bottom"><section><span class="number">01</span><div><strong>Get your private brief.</strong>Step into a fictional identity with three secret goals.</div></section><section><span class="number">02</span><div><strong>Find the common ground.</strong>Ask, listen, and trade your way to an agreement.</div></section><section><span class="number">03</span><div><strong>See how it played out.</strong>Trace every mission point to the deal you both signed.</div></section></div></main>`);
}
function participants() {
  return [state.you, state.peer].map((p,i)=>`<section class="participant ${i?'other':'you'}"><div class="row spread"><span class="eyebrow ${i?'orange':'blue'}">${i?'Stranger':'You'}</span><span class="tag ${i?'warm':'success'}"><span class="dot"></span>${demo?'Sample player':!p?'Waiting':state.mode==='text'?'Text practice':pc?.connectionState==='connected'?'Connected':p.ready?'Ready':'In room'}</span></div><div class="identity"><div class="avatar">${icon('person')}</div><div><strong>${esc(p?.name || 'Your scene partner')}</strong><small>${esc(p?.role || 'Not here yet')}</small></div></div><div class="audio-status"><span>${demo?'Sample audio (off)':state.mode==='text'?'Microphone off':(i?p?.muted:muted)?'Muted':stream?'Microphone on':'Microphone off'}</span><span id="${i?'remote':'local'}-meter" class="audio-meter ${demo?'sample':''}" aria-hidden="true">${'<i></i>'.repeat(9)}</span></div></section>`).join('');
}
function briefMini() {
  return `<details class="brief-disclosure" ${innerWidth>760?'open':''}><summary>${icon('lock','small')} Your private brief ${icon('chevron','small chevron')}</summary><div class="brief-inner"><p class="footnote">Your goals. Your eyes only.</p><ol class="objective-mini">${state.you.objectives.map((o,i)=>`<li><span>${i+1}</span><span>${esc(o)} <b>+20</b></span></li>`).join('')}</ol><button class="text-button" data-action="brief">Open full dossier ${icon('arrow','small')}</button></div></details>`;
}
function timerMarkup(label) {
  return `<div class="timer" role="timer" aria-label="${esc(label)}"><div>${icon('clock')}</div><div><div class="time" id="time">${timeText()}</div><div class="time-label" id="time-label">${esc(label)}</div></div></div>`;
}
function timeText() {
  if (!state?.deadline) return '—:—';
  const seconds = Math.max(0, Math.ceil((state.deadline - Date.now() - serverOffset)/1000));
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}
function captionMarkup(line,i) {
  const isYou = line.speaker === state.you.id;
  const name = isYou ? `You · ${state.you.short}` : state.peer?.short || 'Stranger';
  const time = line.time || new Date(line.timestamp).toISOString().slice(14,19);
  return `<article class="caption" data-line="${i}"><div class="caption-meta"><strong class="${isYou?'':'other'}">${esc(name)}</strong><time>${esc(time)}</time><em>${esc(line.kind)}</em></div><p>${esc(line.text)}</p></article>`;
}
function transcriptMarkup() {
  const lines = demo ? sampleLines.slice(0,demoCount) : state.messages;
  if (!captions) return `<div class="empty-symbol">${icon('captions')}</div><p class="empty-copy">${state.mode==='text'?'Conversation hidden':'Captions hidden'}</p><p class="footnote">${demo?'Sample conversation is still available when you turn captions on.':'Typed messages remain part of this round. No speech transcription is running.'}</p>`;
  if (!lines.length) return `<div class="empty-symbol">${icon(state.mode==='voice'?'mic':'chat')}</div><p class="empty-copy">${state.mode==='voice'?'You’re here. Let the conversation begin.':'Every good deal starts with a question.'}</p><p class="footnote">${state.mode==='voice'?'Speech transcription is not configured. Typed clarifications appear here.':'Send your first message below. This is text practice, not a speaking assessment.'}</p>`;
  return lines.map(captionMarkup).join('');
}
function shelfMarkup() {
  const deal = state.deal; const pkg = delivery.find(p=>p.id===deal?.package);
  const yourAccepted = state.accepted.includes(state.you.id);
  return `<div class="proposal-summary"><div><p class="eyebrow">${deal?`Shared proposal · revision ${state.revision}`:'The negotiation table'}</p>${deal?`<p class="proposal-price">${money(deal.price)}</p><p class="proposal-delivery">${esc(pkg.detail)}</p>`:'<p class="proposal-idle">The next move is yours.</p><p class="proposal-delivery">Turn your conversation into a clear offer.</p>'}</div><button class="btn ${deal?'soft':'primary'}" data-action="proposal">${deal?'Review proposal':'Propose terms'} ${icon(deal?'edit':'arrow','small')}</button></div>${deal?`<div class="acceptance">${[state.you,state.peer].filter(Boolean).map(p=>`<span class="${state.accepted.includes(p.id)?'accepted':''}">${icon(state.accepted.includes(p.id)?'circleCheck':'circle')} ${p.id===state.you.id?'You':esc(p.short)} · ${state.accepted.includes(p.id)?'confirmed':'not confirmed'}</span>`).join('')}</div>${yourAccepted?'<p class="footnote" style="margin-top:8px">Waiting for the other player. Any new offer clears both confirmations.</p>':''}`:''}`;
}
function showRoom() {
  const step = state.phase==='finalize'?2:1;
  shell(`<main id="main" tabindex="-1" class="room-screen">${steps(step)}<div class="room-top"><div><p class="eyebrow muted">Scenario 001 <span aria-hidden="true">/</span> ${demo?'90-second sample':state.mode==='text'?'Text practice':'Private voice room'} <span aria-hidden="true">/</span> Round ${state.round}</p><h1>The Satellite Deal</h1><p class="muted">Negotiate a price. Find a delivery date. Make it work.</p></div>${timerMarkup(state.paused?'Reconnecting':state.phase==='finalize'?'To confirm terms':demo?'Demo time left':'Time to make a deal')}</div>${state.paused?'<div class="notice orange" style="margin-bottom:16px">Connection interrupted. The clock is paused during a recovery window of up to 20 seconds total.</div>':''}<div class="room-grid"><aside class="room-sidebar" aria-label="Participants and private brief">${participants()}${briefMini()}<p class="room-side-note">${icon('shield','small')} Only mission objectives decide the result. Your coaching stays private.</p></aside><section><div class="conversation"><div class="conversation-head"><h2>${state.mode==='text'?'The conversation':'Conversation & captions'}</h2><span class="tag ${demo?'':'success'}"><span class="dot"></span>${demo?'Sample transcript':state.mode==='text'?'Shared text':'No transcription'}</span></div><div class="transcript ${!captions || (!demo && !state.messages.length)?'empty':''}" id="transcript" role="log" aria-label="${demo?'Sample transcript':'Shared typed conversation'}" aria-live="${demo?'off':'polite'}">${transcriptMarkup()}</div><div class="transcript-actions"><span>${demo?'Illustrative dialogue. Nothing is being recorded.':state.mode==='text'?'Messages are labelled as text.':'Voice is not transcribed or recorded by this app.'}</span>${demo?`<button class="text-button" data-action="next-line" ${demoCount>=sampleLines.length?'disabled':''}>Next exchange ${icon('arrow','small')}</button>`:''}</div>${!demo?`<form class="chat-form" id="chat-form"><label class="sr-only" for="chat-message">${state.mode==='text'?'Your message':'Typed clarification'}</label><input id="chat-message" name="message" maxlength="1000" placeholder="${state.mode==='text'?'Make an opening proposal…':'Type a clarification…'}" autocomplete="off" ${state.phase!=='talk'||state.paused?'disabled':''}><button class="btn primary" type="submit" ${state.phase!=='talk'||state.paused?'disabled':''}>Send ${icon('arrow','small')}</button></form>`:''}<div class="proposal-shelf" id="proposal-shelf">${shelfMarkup()}</div><div class="controls"><div class="controls-left"><button class="control" data-action="mute" aria-pressed="${muted}" ${!demo&&state.mode==='text'?'disabled':''}>${icon(muted?'micOff':'mic')} ${muted?'Unmute':'Mute'}</button><button class="control" data-action="captions" aria-pressed="${captions}">${icon('captions')} ${state.mode==='text'?'Transcript': 'Captions'} ${captions?'on':'off'}</button></div><div class="controls-right"><button class="control report" data-action="report">${icon('flag')} Report</button><button class="control end" data-action="leave">${icon('leave')} Leave</button></div></div></div><p class="room-tip">${state.phase==='finalize'?'Conversation time is up. Confirm the exact same revision or choose no deal.':demo?'Try a different price, send the proposal, then confirm each sample player.':'A proposal is an invitation. An agreement needs two confirmations.'}</p></section></div></main>`);
  if(!demo) $('#transcript').scrollTop = $('#transcript').scrollHeight;
}
function dossierMarkup() {
  const you=state.you;
  return `<div class="dossier"><div class="dossier-head"><span class="private-note">${icon('lock')} PRIVATE DOSSIER · ONLY YOU</span><h2>${esc(you.name)}</h2><p>${esc(you.role)} <span aria-hidden="true">/</span> ${esc(you.employer)}</p></div><div class="dossier-body"><p>${esc(you.context)}</p>${you.background.map(b=>`<div class="background-item"><strong>${esc(b.title)}</strong><p>${esc(b.text)}</p></div>`).join('')}<div class="goals-title"><span>Your secret objectives</span><small>60 possible points</small></div><ol class="goals">${you.objectives.map((o,i)=>`<li><span class="goal-number">${i+1}</span><span>${esc(o)}</span><b>20 pts</b></li>`).join('')}</ol><div class="cue"><strong>A place to start</strong>“${esc(you.cue)}”</div><p class="footnote">All characters and organisations are fictional. You can improvise within your facts. You cannot invent extra budget or change the available packages.</p></div></div>`;
}
function showPrep() {
  shell(`<main id="main" tabindex="-1" class="enter">${steps(0)}<div class="room-top" style="max-width:980px;margin:auto"><div><p class="eyebrow blue">Your role is ready</p><h1>Meet your other self.</h1><p class="muted">Read the brief. Keep your objectives to yourself.</p></div>${timerMarkup(state.phase==='waiting'?'Waiting for a friend':'Preparation time')}</div><div class="prep-layout">${dossierMarkup()}<aside class="prep-aside"><span class="eyebrow muted">${state.phase==='waiting'?'An invite to the scene':'The Satellite Deal'}</span><h3>${state.phase==='waiting'?'Better with a scene partner.':'Two agendas. One agreement.'}</h3><p>${state.phase==='waiting'?'Share the room code or copy the invite link. Your friend gets a different private identity.':'Aster Aerospace is selling a satellite prototype programme to Meridian Ventures. Negotiate a price and a delivery package.'}</p><div class="room-code"><strong>${esc(state.code)}</strong><button class="btn secondary" data-action="copy" aria-label="Copy room invite">${icon('copy')}</button></div><p class="footnote">${state.mode==='text'?'Text practice · microphone stays off.':'Voice room · relay-only audio. No speech transcription.'}</p><div class="readiness"><div class="row"><span>You · ${esc(state.you.short)}</span><span class="tag ${state.you.ready?'success':''}">${icon(state.you.ready?'circleCheck':'circle','small')}${state.you.ready?'Ready':'Reading'}</span></div><div class="row"><span>${state.peer?esc(state.peer.short):'Your scene partner'}</span><span class="tag ${state.peer?.ready?'success':''}">${icon(state.peer?.ready?'circleCheck':'circle','small')}${state.peer?.ready?'Ready':state.peer?'Reading':'Not here yet'}</span></div></div>${state.mode==='voice'?`<button class="btn secondary wide" data-action="microphone" ${stream?'disabled':''}>${icon('mic')} ${stream?'Microphone ready':'Enable microphone'}</button><p class="footnote" style="margin:10px 0">Only your microphone is requested, after your acknowledgement. No camera access.</p>`:''}<button class="btn primary wide" data-action="ready" ${state.phase==='waiting'||state.you.ready||state.mode==='voice'&&!stream?'disabled':''}>${state.you.ready?'Waiting for your partner…':'I’m ready. Let’s negotiate.'} ${icon('arrow','small')}</button><p class="footnote" style="margin:14px 0">${state.extended?'Extra preparation time is active. If either player stays unready, the round ends without a score.':'Both players must be ready. One 30-second preparation extension is available automatically.'}</p><div class="divider"></div><button class="text-button" data-action="rules">Read the scoring rules</button><div class="row spread"><button class="text-button muted" data-action="leave">Leave room</button><button class="text-button muted" data-action="report">Report & leave</button></div></aside></div></main>`);
}
function showResults() {
  const r=state.result, you=state.you, peer=state.peer;
  const coachedDemo=demo && you.id==='alex';
  const yours=r.scores[you.id], theirs=r.scores[peer.id];
  const pkg=delivery.find(p=>p.id===state.deal?.package);
  const reason=[r.confirmed?'Both players accepted this revision.':'An objective needs a confirmed deal.',!r.confirmed?'No confirmed deal.':r.yours[1]?'The agreed price meets your target.':'The agreed price falls outside your target.',!r.confirmed?'No confirmed deal.':r.yours[2]?'The package meets your delivery goal.':'The package misses your delivery goal.'];
  const title=!r.confirmed?'No deal. Still a conversation.':yours===theirs?'Common ground. Even score.':yours>theirs?'A deal. And the mission lead.':'A deal worth talking about.';
  shell(`<main id="main" tabindex="-1" class="enter">${steps(3)}<section class="results"><div class="result-header"><p class="eyebrow blue">The debrief <span aria-hidden="true">/</span> ${demo?'Illustrative result':'Round '+state.round}</p><h1>${title}</h1><p>${r.confirmed?'Here’s what you both agreed to, and exactly where the points came from.':esc(state.endReason)}</p></div><div class="agreed-deal"><div><p class="eyebrow">${r.confirmed?`Signed by both players · revision ${state.revision}`:'No confirmed agreement'}</p><p class="proposal-price">${r.confirmed?money(state.deal.price):'No deal'}</p><p class="proposal-delivery">${r.confirmed?esc(pkg.detail):'Both players receive 0 mission points.'}</p></div><div class="agreed-mark">${icon(r.confirmed?'circleCheck':'circle')}<span>${r.confirmed?'Same terms.<br>Two confirmations.':'Declining is<br>part of negotiation.'}</span></div></div><section class="scoreboard"><div class="scoreboard-top"><h2>Mission standings</h2><span class="tag padded">${r.confirmed?(yours===theirs?'Tie':`${esc(yours>theirs?you.short:peer.short)} leads by ${Math.abs(yours-theirs)}`):'No mission winner'}</span></div><div class="score-pair">${[you,peer].map((p,i)=>{const n=r.scores[p.id];return `<div><div class="score-person"><div><strong>${esc(p.short)} ${i?'':'· You'}</strong><small>${esc(p.role)}</small></div><span class="score-number ${i?'other':''}">${n}<small> / 60</small></span></div><div class="score-track ${i?'other':''}" aria-hidden="true">${Array.from({length:3},(_,j)=>`<i class="${j<n/20?'filled':''}"></i>`).join('')}</div></div>`;}).join('')}</div><p class="score-footnote">Only mission points decide the result. Character and communication feedback stay private.</p></section><div class="debrief-grid"><section class="result-card"><span class="private-note">${icon('lock')} YOUR OBJECTIVE ARITHMETIC</span><h2>Every point has a reason.</h2>${you.objectives.map((o,i)=>`<div class="arithmetic ${r.yours[i]?'':'missed'}">${icon(r.yours[i]?'check':'x')}<div>${esc(o)}<small>${reason[i]}</small></div><b>+${r.yours[i]}</b></div>`).join('')}<div class="row spread" style="margin-top:18px;font-size:13px"><strong>Your mission total</strong><strong class="blue">${yours} / 60</strong></div><p class="footnote" style="margin-top:12px">Rules: satellite-1.0 · personal-1.0.<br>Price and delivery objectives require a valid, mutually confirmed deal.</p></section><section class="result-card"><span class="private-note">${icon('lock')} YOUR PRIVATE COACHING</span><h2>${coachedDemo?'Find the question behind the ask.':'Your words deserve evidence.'}</h2>${coachedDemo?`<div class="notice blue">Illustrative coaching from the sample script. This is not an AI assessment of a person.</div><div class="coaching-row"><span>Character consistency</span><strong>10 / 10</strong></div><div class="coaching-row"><span>Using your background</span><strong>10 / 10</strong></div><div class="coaching-row"><span>Communication</span><strong>18 / 20</strong></div><div class="coaching-quote"><strong>Listening · 5/5</strong><blockquote>“Do you need the full prototype, or would a demonstration work?”</blockquote><span class="footnote">Alex · sample speech · 00:12</span><p style="margin:8px 0">You tested what the deadline actually meant. Morgan’s reply opened the door to staged delivery.</p><button class="text-button" data-action="evidence">Inspect all six ratings ${icon('arrow','small')}</button></div><p class="footnote">Coaching is tied to the sample dialogue; it is unchanged by experimenting with deal terms. No combined personal total is presented.</p>`:`<div class="notice">Coaching is unavailable. This build has no transcription or AI provider connected.</div><p class="coaching-quote">All six subjective criteria are <strong>unassessed</strong>. Typed chat does not establish spoken delivery. Your mission result is complete and stands on its own.</p><div class="coaching-row"><span>Character & background</span><span class="muted">Unassessed / 20</span></div><div class="coaching-row"><span>Communication</span><span class="muted">Unassessed / 20</span></div><p class="footnote" style="margin-top:14px">Assessed subtotal: ${yours}/60. Missing: 40 possible coaching points. A personal total out of 100 is not available.</p>`}</section></div><div class="reveal-box"><div><strong>Curious what they were trying to get?</strong><p>Secret objectives are revealed only after both players opt in. Coaching stays private.</p></div><button class="btn secondary" data-action="reveal">${state.you.reveal?'Keep goals private':'Allow goal reveal'} ${icon('lock','small')}</button></div>${demo&&state.you.reveal&&!r.otherObjectives?'<div class="sample-actions"><button class="btn soft" data-action="partner-reveal">Simulate partner’s permission</button></div>':''}${r.otherObjectives?`<section class="reveal-goals"><strong>${esc(peer.short)}’s revealed objectives</strong><ul>${r.otherObjectives.map(g=>`<li>${esc(g.text)} · +${g.points}</li>`).join('')}</ul></section>`:state.you.reveal?'<p class="footnote" style="margin-top:8px">You opted in. Waiting for the other player’s permission.</p>':''}<div class="result-actions"><div class="row"><button class="btn primary" data-action="rematch" ${you.rematch?'disabled':''}>${icon('swap','small')} ${you.rematch?'Rematch requested':'Swap roles & play again'}</button><button class="btn secondary" data-action="download">${icon('download','small')} Save your result</button></div><button class="btn quiet" data-action="exit">Back to lobby</button></div>${demo&&you.rematch?'<div class="sample-actions"><button class="btn soft" data-action="partner-rematch">Simulate partner accepting rematch</button></div>':''}<p class="footnote" id="expiry">${demo?'Sample results are local to this demo.':`Room data expires at ${new Date(state.expires).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Download your own result before then.`}</p></section></main>`);
}
function showIncomplete() {
  shell(`<main id="main" tabindex="-1" class="incomplete enter"><div class="empty-symbol">${icon('leave')}</div><p class="eyebrow muted" style="margin-top:24px">Round incomplete</p><h1>Let’s call it here.</h1><p>${esc(state.endReason)}</p><div class="notice" style="margin-bottom:24px">No winner and no mission score. ${demo?'The microphone was never used.':'Your local audio tracks have been stopped.'}</div><button class="btn primary" data-action="exit">Back to lobby ${icon('arrow','small')}</button></main>`);
}
function applyState(next, force=false) {
  const prevPhase=state?.phase; const prevRound=state?.round;
  const previousRevision=state?.revision;
  const previousAccepted=JSON.stringify(state?.accepted || []);
  const draft=$('#chat-message')?.value;
  const editingMessage=document.activeElement?.id==='chat-message';
  const selection=editingMessage?document.activeElement.selectionStart:null;
  state=next;
  if(next.serverNow) serverOffset=next.serverNow-Date.now();
  if(['complete','incomplete'].includes(next.phase)) stopMedia();
  if(prevRound && prevRound!==next.round) { stopMedia(); captions=true; muted=false; }
  const key=JSON.stringify([next.phase,next.you,next.peer,next.messages,next.deal,next.revision,next.accepted,next.result,next.paused,next.extended,next.endReason]);
  if(force||key!==renderKey) {
    renderKey=key;
    if(['waiting','prep'].includes(next.phase)) showPrep();
    else if(['talk','finalize'].includes(next.phase)) showRoom();
    else if(next.phase==='complete') showResults();
    else showIncomplete();
    if(draft && $('#chat-message')) $('#chat-message').value=draft;
    if(editingMessage && $('#chat-message') && !$('#chat-message').disabled){$('#chat-message').focus({preventScroll:true});$('#chat-message').setSelectionRange(selection,selection);}
    if($('#modal').open && ['complete','incomplete'].includes(next.phase)) closeDialog();
    else if($('#modal').open && $('#proposal-form') && (previousRevision!==next.revision || previousAccepted!==JSON.stringify(next.accepted))) showProposal();
    if(prevPhase!==next.phase) { $('#main')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'}); }
  }
  if(!demo && next.mode==='voice' && next.phase==='talk') startConnection().catch(mediaError);
  if(!demo) handleSignals(next.signals || []).catch(mediaError);
}
async function request(path, data, credential=token) {
  const res=await fetch(path,{ method:data?'POST':'GET', headers:{...(data?{'Content-Type':'application/json'}:{}),...(credential?{Authorization:`Bearer ${credential}`}:{})}, ...(data?{body:JSON.stringify(data)}:{}), signal:AbortSignal.timeout(8000) });
  const value=await res.json(); if(!res.ok) throw new Error(value.error || 'The request failed. Try again.'); return value;
}
async function send(type, data={}) {
  if(demo) return demoAction(type,data);
  const next=await request('/api/action',{code:state.code,type,...data});
  applyState(next); return next;
}
function startPolling() {
  clearTimeout(pollTimer);
  const poll=async()=>{
    if(!state||demo||!token) return;
    try {const next=await request(`/api/room?code=${state.code}`); applyState(next); if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;toast('Room connection restored.');}}
    catch(e) { if(!reconnectTimer){toast('Connection interrupted. Trying to reconnect.',true);reconnectTimer=setTimeout(()=>{if(state&&!demo&&!['complete','incomplete'].includes(state.phase)){stopMedia();applyState({...state,phase:'incomplete',endReason:'The connection could not be restored. No winner was awarded.'},true);}},20000);} }
    pollTimer=setTimeout(poll,900);
  };
  pollTimer=setTimeout(poll,900);
}
function saveSession() { try {sessionStorage.setItem('playcall-session',JSON.stringify({code:state.code,token}));}catch{} }
function clearSession() { try {sessionStorage.removeItem('playcall-session');}catch{} }
function exitToLobby() {
  stopMedia();clearTimeout(pollTimer);clearTimeout(reconnectTimer);reconnectTimer=null;clearSession();state=null;token=null;demo=false;captions=true;muted=false;
  try{history.replaceState(null,'',location.pathname);}catch{} showLobby();window.scrollTo({top:0,behavior:'instant'});
}
async function startDemo(role = 'alex', round = 1) {
  await loadDemoFixtures();
  if(state&&!demo&&!['complete','incomplete'].includes(state.phase)){toast('Leave your current room before opening the demo.',true);return;}
  stopMedia();clearTimeout(pollTimer);demo=true;demoCount=3;captions=true;muted=false;serverOffset=0;
  applyState({code:'DEMO01',mode:'voice',phase:'talk',round,you:{...demoCharacters[role],ready:true,reveal:false,rematch:false},peer:{id:role==='alex'?'morgan':'alex',name:demoCharacters[role==='alex'?'morgan':'alex'].name,short:demoCharacters[role==='alex'?'morgan':'alex'].short,role:demoCharacters[role==='alex'?'morgan':'alex'].role,ready:true},deadline:Date.now()+90000,deal:null,revision:0,accepted:[],messages:[],result:null,packages:delivery},true);
}
function demoResult() {
  const confirmed=state.accepted.length===2;
  const a=confirmed?[20,state.deal.price>=550?20:0,state.deal.package!=='full-6'?20:0]:[0,0,0];
  const b=confirmed?[20,state.deal.price<=500?20:0,state.deal.package!=='full-8'?20:0]:[0,0,0];
  return {confirmed,scores:{alex:total(a),morgan:total(b)},yours:state.you.id==='alex'?a:b,otherObjectives:null,coaching:'sample'};
}
function demoAction(type,data) {
  if(type==='propose'){state.deal={...data.deal,proposer:state.you.id};state.revision++;state.accepted=[];}
  if(type==='confirm'){
    if(data.revision!==state.revision) throw new Error('Review the current revision first.');
    if(!state.accepted.includes(state.you.id))state.accepted.push(state.you.id);
  }
  if(type==='partner-confirm'&&!state.accepted.includes(state.peer.id))state.accepted.push(state.peer.id);
  if(['confirm','partner-confirm'].includes(type)&&state.accepted.length===2){state.phase='complete';state.deadline=null;state.result=demoResult();}
  if(type==='decline'){state.accepted=[];state.phase='complete';state.deadline=null;state.endReason='The sample negotiation ended without an agreement.';state.result=demoResult();}
  if(type==='reveal') {state.you.reveal=data.allow;if(!data.allow)state.result.otherObjectives=null;}
  if(type==='rematch')state.you.rematch=true;
  if(type==='leave'||type==='report'){state.phase='incomplete';state.endReason=type==='report'?'You ended the sample round using Report. No report was submitted.':'You left the sample round.';}
  applyState({...state},true);return state;
}
function openDialog(html) {
  const dialog=$('#modal'); lastOpener=document.activeElement;
  dialog.innerHTML=`<button class="dialog-close" data-action="close" aria-label="Close dialog">${icon('x')}</button>${html}`;
  if(!dialog.open) dialog.showModal();
}
function closeDialog() { $('#modal').close();lastOpener?.isConnected&&lastOpener.focus({preventScroll:true}); }
function showProposal() {
  if(state.paused){toast('Wait for the room to reconnect before changing terms.',true);return;}
  const deal=state.deal || {price:500,package:'phased'};
  openDialog(`<p class="eyebrow blue">${state.deal?`Shared proposal · revision ${state.revision}`:'Put an offer on the table'}</p><h2 id="modal-title" style="margin-top:10px">Make it official.</h2><form id="proposal-form"><div class="form-field"><label for="price">Contract value</label><select id="price" class="price-select" name="price">${[450,475,500,525,550,575,600].map(p=>`<option value="${p}" ${deal.price===p?'selected':''}>${money(p)}</option>`).join('')}</select></div><div class="form-field" style="margin-top:20px"><label for="package">Delivery package</label><select id="package" name="package">${delivery.map(p=>`<option value="${p.id}" ${deal.package===p.id?'selected':''}>${p.detail}</option>`).join('')}</select></div><p class="exact-terms" id="exact-terms">${money(deal.price)} · ${esc(delivery.find(p=>p.id===deal.package).detail)}</p><p class="proposal-meta">Editing a field immediately publishes a new shared revision and clears both confirmations. Reconfirm the exact terms after every change.</p><div class="notice" id="proposal-status">${state.deal?`Revision ${state.revision} · proposed by ${esc(state.deal.proposer===state.you.id?'you':state.peer.short)}`:'This is a draft. Send it before either player can confirm.'}</div><div id="proposal-error" class="error" role="alert" style="margin-top:12px"></div><div class="dialog-actions"><button type="button" class="btn quiet" data-action="decline">No deal</button><button class="btn primary" type="submit" id="proposal-send">${state.deal?'Send revised offer':'Send proposal'} ${icon('arrow','small')}</button></div></form>${state.deal?`<div class="divider" style="margin:20px 0 14px"></div><div class="proposal-accept-row">${[state.you,state.peer].map(p=>`<span class="row ${state.accepted.includes(p.id)?'blue':'muted'}">${icon(state.accepted.includes(p.id)?'circleCheck':'circle','small')}${p.id===state.you.id?'You':esc(p.short)}: ${state.accepted.includes(p.id)?'confirmed':'pending'}</span>`).join('')}</div><button class="btn soft wide" style="margin-top:16px" data-action="confirm" data-revision="${state.revision}" ${state.accepted.includes(state.you.id)?'disabled':''}>${icon('check','small')} Confirm revision ${state.revision}</button>${demo?`<button class="btn secondary wide" style="margin-top:8px" data-action="partner-confirm" ${state.accepted.includes(state.peer.id)?'disabled':''}>Simulate ${esc(state.peer.short)}’s confirmation</button>`:''}`:''}`);
  $('#proposal-form').addEventListener('change',async()=>{
    if($('#exact-terms')) $('#exact-terms').textContent=`${money(Number($('#price').value))} · ${delivery.find(p=>p.id===$('#package').value).detail}`;
    if(!state.deal)return;
    $('#proposal-send').disabled=true;
    $('#modal').querySelectorAll('[data-action="confirm"],[data-action="partner-confirm"]').forEach(b=>b.disabled=true);
    const deal={price:Number($('#price').value),package:$('#package').value};
    try{await send('propose',{deal});showProposal();toast('New revision shared. Both confirmations cleared.');}catch(e){$('#proposal-error').textContent=e.message;$('#proposal-send').disabled=false;}
  });
}
function showPrivacy() {
  openDialog(`<h2 id="modal-title">Privacy, in plain language.</h2><p><strong>Fictional identities don’t make voices anonymous.</strong> Your voice and details you share can identify you. Your partner can make their own recording.</p><p>This build never requests a camera. Voice is available only through a configured TURN relay, with <code>iceTransportPolicy: relay</code>. Your partner is not directly given your IP by a peer media route. The app and relay operator can still see connection metadata.</p><p><strong>Relay operator:</strong> ${esc(config.relayProvider || 'Not configured. Voice calls are unavailable.')}<br><strong>Relay retention:</strong> ${esc(config.relayRetention || 'Not configured.')}</p><p><strong>No recording, transcription, or AI provider is connected.</strong> Text practice is available. Voice captions and subjective coaching are unavailable in real rooms. Demo dialogue and coaching are fixtures, labelled as samples.</p><p>Room text, your private brief, and terms live in this server’s memory. Results expire after 10 minutes; waiting rooms after 15 minutes; all rooms after 1 hour. A server restart clears all rooms. No audio is stored by this app.</p><p>Report stops the call. This prototype has no moderation inbox and does not upload report evidence. No analytics or third-party fonts are loaded.</p><div class="dialog-actions"><button class="btn primary" data-action="close">Got it</button></div>`);
}
function showRules() {
  openDialog(`<h2 id="modal-title">The rules of this scene.</h2><p>Negotiate <strong>$4.50M–$6.00M in $0.25M steps</strong> and one of three delivery packages: full prototype at month 6, full prototype at month 8, or demo at 6 and full at 8. Both people must accept the same revision.</p><p><strong>Mission points alone decide the result.</strong> Your three predefined goals are worth 20 points each. No confirmed deal means 0 mission points for each player. Leaving or a failed connection makes the round incomplete; it does not award a winner.</p>${[['Mission objectives',60],['Character consistency',10],['Using your background',10],['Clarity',5],['Listening',5],['Reasoning & trade-offs',5],['Closing or declining',5]].map(([n,p])=>`<div class="dialog-score"><span>${n}</span><strong>${p} points</strong></div>`).join('')}<p>Character and communication scores are private. Every subjective score requires an attributed transcript quote and explanation. Unclear or missing evidence is <strong>unassessed</strong>. Accent, pitch, and speaking longer earn no points.</p><p>Real rooms in this build have no speech evaluator; all coaching is unassessed. The sample debrief shows how evidence would be presented.</p><div class="dialog-actions"><button class="btn primary" data-action="close">Back to the scene</button></div>`);
}
const sampleRatings=[
  {name:'Character consistency',score:'10/10',line:2,quote:'On Aster-2, we split delivery into stages.',why:'This supplied project and the month-8 preference remain coherent with Alex’s brief.',next:'Keep future improvisation compatible with the assigned facts.'},
  {name:'Using your background',score:'10/10',line:0,quote:'Priya mentioned your presentation is at month six.',why:'This contact grounds the question. At 00:48, “On Aster-2, we split delivery into stages.” supports the staged offer; two details affect the negotiation.',next:'Use background to support a proposal rather than listing credentials.'},
  {name:'Clarity',score:'5/5',line:4,quote:'Agreed: $5.00M, demonstration at month six, full prototype at month eight.',why:'Alex states the exact amount and distinguishes the demonstration from full delivery.',next:'Keep price and both deliverables together when summarising.'},
  {name:'Listening',score:'5/5',line:0,quote:'Do you need the full prototype, or would a demonstration work?',why:'Alex asks what the deadline means. Morgan clarifies at 00:29, and Alex adapts the offer at 00:48.',next:'Check the underlying need before settling on a package.'},
  {name:'Reasoning & trade-offs',score:'3/5',line:2,quote:'A demo at six and the full prototype at eight would give us refinement time.',why:'The schedule has a reason, but the later price concession requests no reciprocal benefit.',next:'Before dropping the price, ask what you can receive in return.'},
  {name:'Closing',score:'5/5',line:4,quote:'Can you confirm those terms?',why:'Alex checks acceptance after explicitly restating all final terms at 01:18.',next:'Continue asking for explicit confirmation of the same revision.'}
];
function showEvidence() {
  openDialog(`<p class="eyebrow blue">Illustrative coaching · sample script</p><h2 id="modal-title" style="margin-top:10px">Show the evidence.</h2><p>These fixed ratings refer to the sample dialogue, not the terms you experimented with or a real person’s performance.</p>${sampleRatings.map((r,i)=>`<details style="border-bottom:1px solid var(--line);padding:12px 0" ${i===3?'open':''}><summary style="font-size:13px"><strong>${r.name}</strong> · ${r.score}</summary><blockquote style="font-size:13px;margin:16px 0 8px;border-left:2px solid var(--blue);padding-left:12px">“${esc(r.quote)}”</blockquote><span class="footnote">Alex · sample speech · ${sampleLines[r.line].time}</span><p>${esc(r.why)}</p><p><strong>Next time:</strong> ${esc(r.next)}</p><button class="text-button" data-action="quote-context" data-line="${r.line}">View transcript context ${icon('arrow','small')}</button></details>`).join('')}<div class="dialog-actions"><button class="btn primary" data-action="close">Close evidence</button></div>`);
}
async function enableMicrophone() {
  if(demo||state?.mode!=='voice'||!config.voiceReady) throw new Error('Voice needs a configured relay. The demo never uses a microphone.');
  if(stream)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS or localhost in a supported browser.');
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  audioContext=new AudioContext();await audioContext.resume();localAnalyser=audioContext.createAnalyser();localAnalyser.fftSize=256;
  audioContext.createMediaStreamSource(stream).connect(localAnalyser);
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(state&&!['complete','incomplete'].includes(state.phase)){stopMedia();send('leave').catch(()=>{});toast('Microphone access ended. The round is incomplete.',true);}}));
  applyState({...state},true);
  measureAudio();
}
function measureAudio() {
  cancelAnimationFrame(meterFrame);
  const measure=(analyser,id,isMuted)=>{
    if(!analyser)return;
    const data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteTimeDomainData(data);
    const rms=Math.sqrt(data.reduce((sum,n)=>sum+(n-128)**2,0)/data.length)/128;
    document.querySelectorAll(`#${id} i`).forEach((bar,i)=>{bar.style.height=`${isMuted?3:Math.max(3,Math.min(20,rms*150*(.6+Math.sin(i*1.7)**2)))}px`;});
  };
  const frame=()=>{if(!stream)return;measure(localAnalyser,'local-meter',muted);measure(remoteAnalyser,'remote-meter',false);meterFrame=requestAnimationFrame(frame);};frame();
}
async function startConnection() {
  if(!stream||pc||voiceRound===state.round)return;
  voiceRound=state.round;
  const relay=await request(`/api/relay?code=${state.code}`);
  if(!state||state.phase!=='talk')return;
  pc=new RTCPeerConnection({...relay,iceTransportPolicy:'relay'});
  stream.getTracks().forEach(track=>pc.addTrack(track,stream));
  pc.onicecandidate=event=>{if(event.candidate&&event.candidate.type==='relay')send('signal',{kind:'ice',payload:event.candidate.toJSON()}).catch(mediaError);};
  pc.ontrack=event=>{
    remoteAudio=new Audio();remoteAudio.autoplay=true;remoteAudio.srcObject=event.streams[0];
    remoteAudio.play().catch(()=>{toast('Audio is ready. Tap “Listen” to enable playback.');const controls=$('.controls-left');if(controls&&!$('[data-action="listen"]'))controls.insertAdjacentHTML('beforeend','<button class="control" data-action="listen">Listen</button>');});
    if(audioContext){remoteAnalyser=audioContext.createAnalyser();remoteAnalyser.fftSize=256;audioContext.createMediaStreamSource(event.streams[0]).connect(remoteAnalyser);}
  };
  pc.onconnectionstatechange=()=>{
    if(pc?.connectionState==='connected'){toast('Relay audio connected.');applyState({...state},true);}
    if(['failed','disconnected'].includes(pc?.connectionState)){stopMedia();send('leave').catch(()=>{});toast('The audio connection was lost. This round is incomplete.',true);}
  };
  if(state.you.id==='alex'){await pc.setLocalDescription(await pc.createOffer());await send('signal',{kind:'offer',payload:pc.localDescription.toJSON()});}
}
let handlingSignals=false;
async function handleSignals(signals) {
  if(!signals.length||!pc||handlingSignals)return;
  handlingSignals=true;
  try {
    let through=0;
    for(const signal of signals){
      through=Math.max(through,signal.id);
      if(seenSignals.has(signal.id))continue;
      if(signal.kind==='offer'){await pc.setRemoteDescription(signal.payload);await pc.setLocalDescription(await pc.createAnswer());await send('signal',{kind:'answer',payload:pc.localDescription.toJSON()});}
      if(signal.kind==='answer')await pc.setRemoteDescription(signal.payload);
      if(signal.kind==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(signal.payload);else pendingIce.push(signal.payload);}
      if(pc.remoteDescription&&pendingIce.length){for(const c of pendingIce)await pc.addIceCandidate(c);pendingIce=[];}
      seenSignals.add(signal.id);
    }
    if(through)await send('signal',{kind:'ack',through});
  }finally{handlingSignals=false;}
}
function stopMedia() {
  if(pc){pc.onconnectionstatechange=null;pc.onicecandidate=null;pc.ontrack=null;pc.close();pc=null;}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  if(remoteAudio){remoteAudio.pause();remoteAudio.srcObject=null;remoteAudio=null;}
  audioContext?.close().catch(()=>{});audioContext=null;localAnalyser=null;remoteAnalyser=null;cancelAnimationFrame(meterFrame);
  voiceRound=null;seenSignals.clear();pendingIce=[];
}
function mediaError(e){toast(`Audio problem: ${e.message}. Leave the room and try again.`,true);stopMedia();if(state&&!['complete','incomplete'].includes(state.phase))send('leave').catch(()=>{});}
function downloadResult() {
  const result={product:'PlayCall',scenarioVersion:'satellite-1.0',rubricVersion:'personal-1.0',sample:demo,mode:state.mode,character:state.you.name,deal:state.result.confirmed?state.deal:null,missionPoints:state.result.scores[state.you.id],objectives:state.you.objectives.map((text,i)=>({text,points:state.result.yours[i]})),coaching:demo&&state.you.id==='alex'?sampleRatings:{status:'unassessed',reason:'No speech transcription or evaluator configured.'},transcript:demo?sampleLines:state.messages,otherGoals:state.result.otherObjectives || 'Private: mutual permission not given.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`playcall-${demo?'sample':state.code.toLowerCase()}-your-result.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function actionHandler(action,el) {
  if(action==='theme'){activeTheme=activeTheme==='dark'?'light':'dark';document.documentElement.dataset.theme=activeTheme;try{localStorage.setItem('playcall-theme',activeTheme);}catch{}el.innerHTML=appearanceButton();el.setAttribute('aria-label',`Switch to ${activeTheme==='dark'?'light':'dark'} appearance`);return;}
  if(action==='close'){closeDialog();return;}
  if(action==='home'){if(state&&!['complete','incomplete'].includes(state.phase)){action='leave';}else{exitToLobby();return;}}
  if(action==='tab-create'||action==='tab-join'){lobbyTab=action==='tab-create'?'create':'join';showLobby();$(`#${lobbyTab}-tab`)?.focus();return;}
  if(action==='mode-text'||action==='mode-voice'){selectedMode=action==='mode-text'?'text':'voice';document.querySelectorAll('.mode-option').forEach(b=>b.setAttribute('aria-pressed',b.dataset.action===action));return;}
  if(action==='demo'){await startDemo();return;}
  if(['exit-demo','exit'].includes(action)){exitToLobby();return;}
  if(action==='privacy'){showPrivacy();return;}
  if(action==='rules'){showRules();return;}
  if(action==='how'){openDialog(`<h2 id="modal-title">A new role. A real conversation.</h2><p><strong>01 · Get cast.</strong> Create a room, invite a friend, and read your private brief. You each have three secret objectives and 45 seconds to prepare.</p><p><strong>02 · Negotiate.</strong> Talk for five minutes, ask what matters to your partner, and make a proposal. Text practice works without a microphone.</p><p><strong>03 · Agree.</strong> Both confirm the exact same price and package. Editing the offer clears both confirmations. You can also decline.</p><p><strong>04 · Debrief.</strong> Inspect the mission arithmetic. Secret objectives are revealed only with both players’ permission. Request a rematch to swap roles.</p><div class="dialog-actions"><button class="btn primary" data-action="close">Let’s play</button></div>`);return;}
  if(action==='brief'){openDialog(`<h2 id="modal-title">Your private dossier</h2>${dossierMarkup()}`);return;}
  if(action==='copy'){const invite=`${location.origin}${location.pathname}?room=${state.code}`;try{await navigator.clipboard.writeText(invite);toast('Invite copied. Share it with your scene partner.');}catch{openDialog(`<h2 id="modal-title">Your room invite</h2><label class="form-field">Copy this link<input readonly value="${esc(invite)}"></label><p>Room code: <strong>${state.code}</strong></p>`);}return;}
  if(action==='ready'){el.disabled=true;try{await send('ready');}catch(e){el.disabled=false;throw e;}return;}
  if(action==='microphone'){el.disabled=true;try{await enableMicrophone();}catch(e){el.disabled=false;throw e;}return;}
  if(action==='listen'){await remoteAudio?.play();toast('Audio playback enabled.');return;}
  if(action==='mute'){muted=!muted;stream?.getAudioTracks().forEach(t=>t.enabled=!muted);if(!demo)await send('mute',{muted});applyState({...state},true);return;}
  if(action==='captions'){captions=!captions;applyState({...state},true);return;}
  if(action==='next-line'){demoCount=Math.min(sampleLines.length,demoCount+1);applyState({...state},true);$('#transcript').scrollTop=$('#transcript').scrollHeight;return;}
  if(action==='proposal'){showProposal();return;}
  if(action==='confirm'){el.disabled=true;try{await send('confirm',{revision:Number(el.dataset.revision)});if(state.phase==='complete')closeDialog();else showProposal();}catch(e){showProposal();throw e;}return;}
  if(action==='partner-confirm'){await send('partner-confirm');if(state.phase==='complete')closeDialog();else showProposal();return;}
  if(action==='decline'){await send('decline');closeDialog();return;}
  if(action==='reveal'){await send('reveal',{allow:!state.you.reveal});return;}
  if(action==='partner-reveal'){
    const role=state.peer.id;
    const points=role==='alex'?[20,state.deal?.price>=550?20:0,state.deal?.package!=='full-6'?20:0]:[20,state.deal?.price<=500?20:0,state.deal?.package!=='full-8'?20:0];
    state.result.otherObjectives=demoCharacters[role].objectives.map((text,i)=>({text,points:state.result.confirmed?points[i]:0}));
    applyState({...state},true);toast('Sample partner permission granted.');return;
  }
  if(action==='rematch'){await send('rematch');return;}
  if(action==='partner-rematch'){
    const role=state.you.id==='alex'?'morgan':'alex',round=state.round+1;await startDemo(role,round);toast('Roles swapped. Read your new private dossier.');return;
  }
  if(action==='evidence'){showEvidence();return;}
  if(action==='quote-context'){const line=Number(el.dataset.line);openDialog(`<h2 id="modal-title">Transcript context</h2><p class="footnote">Sample dialogue · not a real recording</p>${sampleLines.slice(Math.max(0,line-1),Math.min(sampleLines.length,line+2)).map((l,i)=>captionMarkup(l,Math.max(0,line-1)+i)).join('<div style="height:16px"></div>')}<div class="dialog-actions"><button class="btn secondary" data-action="evidence">Back to ratings</button></div>`);return;}
  if(action==='download'){downloadResult();return;}
  if(action==='leave'||action==='report'){
    const report=action==='report';
    openDialog(`<h2 id="modal-title">${report?'Report & leave':'Leave this round?'}</h2><p>${report?'This immediately ends the call and stops your microphone. This prototype has no moderation inbox: no report or excerpts will be uploaded.':'Leaving stops your microphone and marks the round incomplete. Neither player is awarded a mission score.'}</p><div class="dialog-actions"><button class="btn secondary" data-action="close">Stay in room</button><button class="btn danger" data-action="${report?'report-now':'leave-now'}">${report?'End round':'Leave round'}</button></div>`);return;
  }
  if(action==='leave-now'||action==='report-now'){stopMedia();try{await send(action==='report-now'?'report':'leave');}catch{applyState({...state,phase:'incomplete',endReason:'You left the round. The server connection was unavailable.'},true);}closeDialog();return;}
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;event.preventDefault();
  try{await actionHandler(el.dataset.action,el);}catch(e){toast(e.message,true);}
});
document.addEventListener('keydown',event=>{
  if(event.target.getAttribute('role')!=='tab'||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  lobbyTab=event.key==='Home'?'create':event.key==='End'?'join':lobbyTab==='create'?'join':'create';
  showLobby();$(`#${lobbyTab}-tab`)?.focus();
});
document.addEventListener('submit',async event=>{
  if(!['lobby-form','chat-form','proposal-form'].includes(event.target.id))return;
  event.preventDefault();const form=event.target;const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
    if(form.id==='lobby-form'){
      $('#lobby-error').textContent='';
      if(!$('#consent').checked){$('#consent').focus();throw new Error('Acknowledge the processing details before joining.');}
      if(lobbyTab==='join'&&!/^[a-f0-9]{6}$/i.test($('#join-code').value.trim())){$('#join-code').focus();throw new Error('Enter the six-character room code from your invite.');}
      const next=await request(lobbyTab==='create'?'/api/rooms':'/api/join',lobbyTab==='create'?{consent:true,mode:selectedMode}:{consent:true,code:$('#join-code').value.trim().toUpperCase()},null);
      token=next.token;delete next.token;demo=false;applyState(next,true);saveSession();startPolling();
    }else if(form.id==='chat-form'){
      const input=$('#chat-message'),text=input.value.trim();if(!text){input.focus();return;}
      await send('message',{text});$('#chat-message').value='';$('#chat-message').focus();
    }else if(form.id==='proposal-form'){
      const deal={price:Number($('#price').value),package:$('#package').value};await send('propose',{deal});showProposal();toast('Proposal shared. Both players must confirm.');
    }
  }catch(e){const field=form.querySelector('.error');if(field)field.textContent=e.message;else toast(e.message,true);}
  finally{if(button?.isConnected)button.disabled=false;}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}});
$('#modal').addEventListener('close',()=>{lastOpener?.isConnected&&lastOpener.focus({preventScroll:true});});
window.addEventListener('pagehide',()=>{
  stopMedia();
  if(state&&!demo&&token&&!['complete','incomplete'].includes(state.phase))fetch('/api/action',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({code:state.code,type:'leave'})}).catch(()=>{});
});
setInterval(()=>{
  if(!state)return;
  const t=$('#time');if(t&&!state.paused)t.textContent=timeText();
  const remaining=state.deadline-Date.now()-serverOffset;
  $('.timer')?.classList.toggle('urgent',remaining<60000&&remaining>0&&['talk','finalize'].includes(state.phase));
  if(demo&&state.deadline&&remaining<=0){
    if(state.phase==='talk'){state.phase='finalize';state.deadline=Date.now()+45000;applyState({...state},true);}
    else if(state.phase==='finalize'){state.phase='complete';state.deadline=null;state.endReason='The sample confirmation window ended without an agreement.';state.result=demoResult();applyState({...state},true);}
  }
},500);
async function boot() {
  if(!packagedDemo){try{config=await request('/api/config',null,null);}catch{toast('The room server is unavailable. The interactive demo still works.',true);}}
  if(new URLSearchParams(location.search).get('demo')==='1'||packagedDemo){await startDemo();return;}
  let saved;try{saved=JSON.parse(sessionStorage.getItem('playcall-session'));}catch{}
  if(saved?.token&&saved?.code){try{token=saved.token;applyState(await request(`/api/room?code=${saved.code}`),true);startPolling();return;}catch{token=null;clearSession();}}
  showLobby();
}
boot();
