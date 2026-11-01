import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gsap } from 'gsap';
import { FlowStepperHeader } from '../components/FlowStepperHeader';
import { CountdownRing } from '../components/CountdownRing';
import { OfferSheet } from '../components/OfferSheet';
import { Drawer } from '../primitives/Drawer';
import { Sheet } from '../primitives/Sheet';
import {
  fetchRoom,
  formatMoney,
  getProfile,
  getRoomToken,
  joinRoomByCode,
  recordCompletedRound,
  RoomView,
  sendRoomAction,
  startSparring,
  submitLeaderboardScore,
} from '../lib/api';
import { useVoiceCall } from '../lib/voiceCall';
import { useToast } from '../providers/ToastProvider';

export default function Room() {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(() => getRoomToken(roomCode));
  const [view, setView] = useState<RoomView | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [error, setError] = useState('');
  const [joiningDirect, setJoiningDirect] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const warnedTurn = useRef('');

  const handleRoomView = useCallback(
    (next: RoomView, activeToken: string | null) => {
      setServerOffset(next.serverNow - Date.now());
      setView(next);
      setError('');
      if ((next.phase === 'complete' || next.phase === 'incomplete') && !finishedRef.current) {
        finishedRef.current = true;
        if (next.result) {
          recordCompletedRound(next);
          const prof = getProfile();
          if (prof.leaderboardOptIn && prof.callsign && activeToken) {
            void submitLeaderboardScore(roomCode, activeToken, prof.callsign).catch(() => {});
          }
        }
        navigate(`/results/${roomCode}`, { replace: true });
      }
    },
    [roomCode, navigate],
  );

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!token) return;
      setSending(true);
      try {
        const next = await sendRoomAction(roomCode, token, payload);
        handleRoomView(next, token);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setSending(false);
      }
    },
    [token, roomCode, handleRoomView, toast],
  );

  const voice = useVoiceCall({
    speakingTurn: view?.speakingTurn ?? null,
    serverOffset,
    paused: view?.paused ?? false,
    coaching: !!view?.coaching?.configured && !!view.coaching.allConsented,
    round: view?.round ?? 1,
    transcribe: subtitlesOn,
    code: roomCode,
    token,
    phase: view?.phase ?? null,
    role: view?.you.id ?? null,
    sparring: !!view?.sparring,
    messages: view?.messages ?? [],
    onSpokenLine: text => {
      if (view?.phase === 'talk') void act({ type: 'message', text });
    },
    onRoomPush: next => {
      handleRoomView(next, token);
    },
  });

  useEffect(() => {
    const turn = view?.speakingTurn;
    if (!turn || !voice.canSpeak || voice.turnRemaining > turn.warningMs / 1000 || voice.turnRemaining <= 0) return;
    const key = `${view.round}:${turn.index}`;
    if (warnedTurn.current === key) return;
    warnedTurn.current = key;
    toast('10 seconds left — wrap up your point. Your microphone will mute when your turn ends.');
  }, [view?.round, view?.speakingTurn, voice.canSpeak, voice.turnRemaining, toast]);

  async function coachingConsent(granted: boolean) {
    if (!view) return;
    try {
      const response = await fetch('/api/vc/coaching/consent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: roomCode, round: view.round, granted }),
      });
      if (!response.ok) throw new Error('Could not save coaching preference.');
      handleRoomView(await response.json(), token);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save coaching preference.'); }
  }

  // Fallback heartbeat poll (SSE handles real-time <5ms sync; this keeps server presence fresh)
  const sync = useCallback(async () => {
    if (!token || !roomCode) return;
    try {
      const next = await fetchRoom(roomCode, token);
      handleRoomView(next, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach room.');
    }
  }, [token, roomCode, handleRoomView]);

  useEffect(() => {
    if (!token) return;
    void sync();
    const id = setInterval(() => void sync(), 2500);
    return () => clearInterval(id);
  }, [token, sync]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.room-pop', { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.05, ease: 'expo.out' });
    }, el);
    return () => ctx.revert();
  }, [view?.phase]);

  async function onSendFallbackNote(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await act({ type: 'message', text });
  }

  async function handleDirectJoin() {
    setJoiningDirect(true);
    setError('');
    void voice.joinMic();
    try {
      const joined = await joinRoomByCode(roomCode);
      if (joined.token) setToken(joined.token);
      setView(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join call.');
    } finally {
      setJoiningDirect(false);
    }
  }

  async function switchToSparring() {
    try {
      if (token) void sendRoomAction(roomCode, token, { type: 'leave' }).catch(() => {});
      void voice.joinMic();
      const spar = await startSparring();
      navigate(`/room/${spar.code}`, { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start sparring call.');
    }
  }

  if (!token) {
    return (
      <div className="flow-page">
        <FlowStepperHeader step={0} badge="VC" closeTo="/play" />
        <div className="flow-column">
          <div className="dossier-card">
            <span className="kicker mono">INCOMING VOICE ROOM · {roomCode}</span>
            <h1 className="display" style={{ fontSize: 'clamp(36px, 5vw, 56px)', marginBottom: 12 }}>Connect to VC {roomCode}</h1>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
              Real-time camera-free voice call. Clicking below unlocks your microphone and deals your secret brief.
            </p>
            {error ? <div className="notice notice-danger" style={{ marginBottom: 16 }}>{error}</div> : null}
            <button type="button" className="wise-cta-wide" disabled={joiningDirect} onClick={() => void handleDirectJoin()}>
              {joiningDirect ? 'Connecting audio…' : `🎙️ Connect to VC ${roomCode}`}
            </button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <Link to="/play">Back to Command Hub</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flow-page">
        <FlowStepperHeader step={1} closeTo="/play" />
        <div className="flow-column" style={{ textAlign: 'center', paddingTop: 64 }}>
          {error ? (
            <>
              <h1 className="display" style={{ fontSize: 44 }}>Call unavailable</h1>
              <p style={{ color: 'var(--muted)', margin: '12px 0 24px' }}>{error}</p>
              <Link to="/play" className="btn btn-primary btn-lg">Return to Hub</Link>
            </>
          ) : (
            <p className="mono" style={{ color: 'var(--muted)' }}>DIALING VOICE CHANNEL {roomCode}…</p>
          )}
        </div>
      </div>
    );
  }

  const badge = view.you.id === 'alex' ? 'AV' : 'MR';
  const stepIndex: 0 | 1 | 2 | 3 = view.phase === 'waiting' ? 0 : view.phase === 'prep' ? 1 : 2;
  const inviteUrl = `${window.location.origin}/room/${view.code}`;
  const activePkg = view.packages.find(p => p.id === view.deal?.package);
  const youConfirmed = view.accepted.includes(view.you.id);
  const peerConfirmed = view.peer ? view.accepted.includes(view.peer.id) : false;

  const lastYourLine = [...view.messages].reverse().find(m => m.speaker === view.you.id)?.text || '';
  const lastPeerLine = [...view.messages].reverse().find(m => m.speaker !== view.you.id)?.text || '';

  const transportLabel = view.sparring
    ? 'LIVE VC · VOICE AI'
    : voice.rtcState === 'connected'
    ? 'LIVE VC · WEBRTC P2P'
    : voice.rtcState === 'relay'
    ? 'LIVE VC · LOW-LATENCY RELAY'
    : voice.peerOnline
    ? 'HANDSHAKING AUDIO…'
    : 'WAITING FOR CALLER…';

  return (
    <div className="flow-page" ref={stageRef}>
      <FlowStepperHeader step={stepIndex} badge={badge} onClose={() => setLeaveOpen(true)} />
      {view.sparring ? <p className="notice" role="note">Scripted solo practice: your partner follows deterministic rules and uses browser speech synthesis. This is not a human caller or an LLM.</p> : null}

      {/* ---------------- WAITING FOR CALLER ---------------- */}
      {view.phase === 'waiting' ? (
        <div className="flow-column">
          <div className="waiting-card room-pop">
            <span className="waiting-pulse" aria-hidden="true" />
            <p className="kicker mono">VOICE LINE OPEN · RINGING</p>
            <div className="room-code-giant mono tnum">{view.code}</div>
            <p className="waiting-copy">
              Share this invite link with a different browser profile, private window, or device. Two normal tabs share one identity. Your secret identity (<strong>{view.you.name}</strong>) is locked in.
            </p>
            <div className="waiting-actions">
              <button
                type="button"
                className="wise-pill wise-pill-solid"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl);
                  toast('VC invite link copied!');
                }}
              >
                Copy VC invite link
              </button>
              <span className="wise-pill wise-pill-soft">Second caller: use a private window or another browser</span>
              <button type="button" className="wise-pill wise-pill-orange" onClick={() => void switchToSparring()}>
                🎙️ Call scripted practice partner
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- PREP: GREENROOM BRIEF + MIC CHECK ---------------- */}
      {view.phase === 'prep' ? (
        <div className="prep-wrap">
          <div className="dossier-card room-pop">
            <div className="dossier-top-row">
              <div>
                <p className="kicker mono">GREENROOM MIC CHECK — {view.you.name.toUpperCase()}</p>
                <h1 className="display dossier-hero-name">{view.you.role}</h1>
                <p className="dossier-employer">{view.you.employer} · Alias on VC: <strong>{view.you.name}</strong></p>
              </div>
              <CountdownRing deadline={view.deadline} serverOffset={serverOffset} totalSeconds={45} label="Call starts" paused={view.paused} />
            </div>

            <p className="dossier-context">{view.you.context}</p>

            <div className="dossier-goals">
              <div className="kicker mono">THREE SECRET OBJECTIVES (20 PTS EACH)</div>
              <ol>
                {view.you.objectives.map((obj, i) => (
                  <li key={i}>
                    <span className="goal-idx mono">0{i + 1}</span>
                    <span className="goal-txt">{obj}</span>
                    <span className="goal-pts mono tnum">+20</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Live greenroom mic meter */}
            <div className="notice" style={{ marginBottom: 18 }}>
              <strong>Six speaking turns · 45 seconds each</strong>
              <p>Alex starts. A 10-second reminder helps you wrap up, then your microphone mutes until your next turn. Both microphones stay muted during final signing.</p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
                <input type="checkbox" checked={view.coaching?.consent ?? false} disabled={!view.coaching?.configured} onChange={e => void coachingConsent(e.target.checked)} />
                <span>Enable AI coaching for this round. My speaking turns go to ElevenLabs for transcription; the conversation text and my private brief go to the configured LLM ({view.coaching?.model ?? 'not configured'}) for rubric feedback. PlayCall stores transcripts and feedback, not audio files. Provider retention policies apply. Both players must opt in.</span>
              </label>
              <p className="mono">{!view.coaching?.configured ? 'AI coaching is unavailable on this server. Mission scoring is enabled.' : view.coaching.allConsented ? 'Both players opted in. Speech recording starts only during your turns.' : 'AI coaching is off until both players opt in.'}</p>
            </div>
            <div className="greenroom-mic-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className={`wise-pill ${voice.micJoined ? 'wise-pill-confirm' : 'wise-pill-solid'}`}
                  onClick={() => void voice.joinMic()}
                >
                  {voice.micJoined ? '🎙️ Mic connected ✓' : '🎙️ Allow microphone'}
                </button>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                  {voice.micJoined ? 'Mic connected; muted until your speaking turn' : 'Camera hardware stays blocked'}
                </span>
              </div>
              <div className="waveform is-compact" aria-hidden="true">
                {voice.localBars.slice(0, 12).map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>

            <div className="dossier-footer-bar">
              <div className="ready-pills">
                <span className={`status-tag ${view.you.ready ? 'is-ready' : ''}`}>
                  You: {view.you.ready ? 'On the line ✓' : 'In greenroom'}
                </span>
                <span className={`status-tag is-partner ${view.peer?.ready ? 'is-ready' : ''}`}>
                  {view.peer?.short || 'Caller'}: {view.peer?.ready ? 'On the line ✓' : 'In greenroom'}
                </span>
              </div>

              <button
                type="button"
                className="wise-cta-wide"
                style={{ maxWidth: 280 }}
                disabled={view.you.ready || sending}
                onClick={async () => {
                  if (!voice.micJoined) void voice.joinMic();
                  await act({ type: 'ready' });
                }}
              >
                {view.you.ready ? 'Dialing caller…' : '🎙️ Hop on live VC →'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- REAL-TIME VOICE CALL STAGE (TALK / FINALIZE) ---------------- */}
      {(view.phase === 'talk' || view.phase === 'finalize') ? (
        <div className="stage-shell vc-stage-shell">
          <div className="stage-topbar room-pop">
            <div className="vc-header-left">
              <div className="vc-status-row">
                <span className={`vc-live-pill${voice.rtcState === 'connected' || voice.rtcState === 'relay' || view.sparring ? ' is-connected' : ''}`}>
                  <i className="vc-dot" />
                  {transportLabel}
                </span>
                <button
                  type="button"
                  className="vc-room-chip mono"
                  onClick={() => {
                    void navigator.clipboard?.writeText(inviteUrl);
                    toast(`Copied room ${view.code} VC link`);
                  }}
                  title="Copy VC link"
                >
                  ROOM {view.code} · R{view.round} ⧉
                </button>
              </div>
              <h1 className="stage-title">The Satellite Deal</h1>
            </div>

            <div className="stage-topbar-right">
              <CountdownRing
                deadline={view.deadline}
                serverOffset={serverOffset}
                totalSeconds={view.phase === 'finalize' ? 45 : 270}
                label={view.phase === 'finalize' ? 'Final sign' : 'Live VC'}
                paused={view.paused}
              />
            </div>
          </div>

          <div className={`notice${voice.canSpeak && voice.turnRemaining <= 10 ? ' notice-danger' : ''}`} role="status" aria-live="polite" style={{ marginBottom: 18 }} data-testid="speaking-turn">
            <strong>{view.phase === 'finalize' ? 'Speaking time is over · both microphones muted' : view.paused ? 'Turn paused · microphones muted' : view.speakingTurn ? `Turn ${view.speakingTurn.index + 1} / ${view.speakingTurn.total} · ${voice.canSpeak ? 'Your turn' : `${view.speakingTurn.speaker === 'alex' ? 'Alex' : 'Morgan'}’s turn`}` : 'Switching turns · microphones muted'}</strong>
            {view.phase === 'talk' && view.speakingTurn ? <p><span className="mono tnum" data-testid="turn-seconds">{voice.turnRemaining}s</span> · {voice.canSpeak ? voice.turnRemaining <= 10 ? 'Wrap up — your microphone mutes at zero.' : 'You have the floor. Your microphone mutes automatically at zero.' : 'Listen now. Your microphone opens on your next turn unless you manually mute it.'}</p> : <p>Review and sign the current offer before the final clock runs out.</p>}
            {view.coaching?.allConsented ? <p>{voice.recordingStatus || 'AI coaching enabled. Speech is transcribed after each turn.'}</p> : <p>AI coaching off for this round.</p>}
          </div>

          {!voice.micJoined ? (
            <div className="vc-unlock-banner room-pop">
              <div>
                <strong>Your microphone isn’t connected yet.</strong>
                <span> Click once to join real-time voice audio (zero cameras).</span>
              </div>
              <button type="button" className="wise-pill wise-pill-solid" onClick={() => void voice.joinMic()}>
                🎙️ Connect Audio Now
              </button>
            </div>
          ) : null}

          {voice.micError ? (
            <div className="notice" style={{ marginBottom: 14 }}>
              Mic note: {voice.micError} — You can still listen live and open <strong>Call Log</strong> in the dock to send notes.
            </div>
          ) : null}

          {/* -------- FULL-STAGE DUAL CALLER VOICE CARDS -------- */}
          <section className="call-stage-tiles is-immersive room-pop" aria-label="Active voice callers">
            {/* YOU · BLUE VOICE LINE */}
            <article className={`caller-tile is-you${voice.youSpeaking ? ' is-speaking' : ''}`}>
              <div className="caller-tile-top">
                <span className="caller-chan-pill is-you">YOU · BLUE VOICE</span>
                <span className={`caller-mic-state${voice.micJoined && !voice.effectivelyMuted ? ' is-live' : ''}`}>
                  {!voice.micJoined
                    ? 'Mic disconnected'
                    : !voice.canSpeak
                    ? 'Turn muted · listening'
                    : voice.muted
                    ? 'Muted (M)'
                    : voice.pttMode
                    ? voice.pttHeld
                      ? 'Transmitting [Space]'
                      : 'Hold [Space] to talk'
                    : voice.youSpeaking
                    ? 'Speaking live'
                    : 'Open Mic live'}
                </span>
              </div>

              <div className="caller-hero-visual">
                <div className={`caller-orb is-lg is-you${voice.youSpeaking ? ' is-pulsing' : ''}`}>
                  <span>{view.you.id === 'alex' ? 'AV' : 'MR'}</span>
                </div>
                <div className="caller-identity is-centered">
                  <strong>{view.you.name}</strong>
                  <small>{view.you.role} · {view.you.employer}</small>
                </div>
              </div>

              <div className="waveform is-wide" aria-hidden="true">
                {voice.localBars.map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>

              {subtitlesOn ? (
                <div className={`vc-caption-box is-you${voice.interimText ? ' is-active' : ''}`}>
                  <span className="vc-caption-tag mono">{voice.interimText ? 'LIVE MIC' : 'LAST SPOKEN'}</span>
                  <p>
                    {voice.interimText
                      ? `“${voice.interimText}…”`
                      : lastYourLine
                      ? `“${lastYourLine}”`
                      : `Cue: “${view.you.cue}”`}
                  </p>
                </div>
              ) : null}
            </article>

            {/* STRANGER · ORANGE VOICE LINE */}
            <article className={`caller-tile is-them${voice.partnerSpeaking ? ' is-speaking' : ''}`}>
              <div className="caller-tile-top">
                <span className="caller-chan-pill is-them">STRANGER · ORANGE VOICE</span>
                <span className={`caller-mic-state is-them${voice.partnerSpeaking ? ' is-live' : ''}`}>
                  {voice.speakerMuted
                    ? 'Deafened (D)'
                    : voice.peerMuted
                    ? 'Caller muted'
                    : voice.partnerSpeaking
                    ? 'Speaking live…'
                    : view.sparring
                    ? 'Listening on VC'
                    : voice.rtcState === 'connected'
                    ? 'WebRTC audio live'
                    : voice.rtcState === 'relay'
                    ? 'Live audio relay'
                    : 'Connecting audio…'}
                </span>
              </div>

              <div className="caller-hero-visual">
                <div className={`caller-orb is-lg is-them${voice.partnerSpeaking ? ' is-pulsing' : ''}`}>
                  <span>{view.peer?.id === 'alex' ? 'AV' : 'MR'}</span>
                </div>
                <div className="caller-identity is-centered">
                  <strong>{view.peer?.name || 'Anonymous caller'}</strong>
                  <small>{view.peer ? `${view.peer.role} · ${view.peer.employer}` : 'Joining voice channel…'}</small>
                </div>
              </div>

              <div className="waveform is-wide is-them" aria-hidden="true">
                {voice.remoteBars.map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>

              {subtitlesOn ? (
                <div className={`vc-caption-box is-them${voice.peerInterim || voice.partnerSpeaking ? ' is-active' : ''}`}>
                  <span className="vc-caption-tag mono">{voice.peerInterim ? 'LIVE AUDIO' : 'LAST SPOKEN'}</span>
                  <p>
                    {voice.peerInterim
                      ? `“${voice.peerInterim}…”`
                      : lastPeerLine
                      ? `“${lastPeerLine}”`
                      : 'Listening for caller on the voice line…'}
                  </p>
                </div>
              ) : null}
            </article>
          </section>

          {/* -------- FLOATING REAL-TIME VC CONTROL DOCK -------- */}
          <div className="call-dock room-pop" role="toolbar" aria-label="Voice chat controls">
            {!voice.micJoined ? (
              <button type="button" className="dock-btn is-primary-mic" onClick={() => void voice.joinMic()}>
                <MicSvg off={false} />
                <span>Connect Mic</span>
              </button>
            ) : (
              <button
                type="button"
                className={`dock-btn${voice.effectivelyMuted ? ' is-muted' : ' is-active'}`}
                onClick={voice.toggleMute}
                aria-pressed={voice.muted}
                title="Shortcut: M"
              >
                <MicSvg off={voice.effectivelyMuted} />
                <span>
                  {!voice.canSpeak
                    ? 'Turn muted'
                    : voice.muted
                    ? 'Unmute (M)'
                    : voice.pttMode
                    ? voice.pttHeld
                      ? 'Talking…'
                      : 'Hold [Space]'
                    : 'Mic On'}
                </span>
              </button>
            )}

            <button
              type="button"
              className={`dock-btn${voice.pttMode ? ' is-active-soft' : ''}`}
              onClick={voice.togglePttMode}
              aria-pressed={voice.pttMode}
              title="Switch between Open Mic and Push-to-Talk (Spacebar)"
            >
              <span>{voice.pttMode ? 'Mode: PTT [Space]' : 'Mode: Open Mic'}</span>
            </button>

            <button
              type="button"
              className={`dock-btn${voice.speakerMuted ? ' is-muted' : ''}`}
              onClick={voice.toggleSpeaker}
              aria-pressed={voice.speakerMuted}
              title="Shortcut: D"
            >
              <SpeakerSvg off={voice.speakerMuted} />
              <span>{voice.speakerMuted ? 'Deafened' : 'Speaker'}</span>
            </button>

            <button
              type="button"
              className={`dock-btn${subtitlesOn ? ' is-active-soft' : ''}`}
              onClick={() => setSubtitlesOn(v => !v)}
              aria-pressed={subtitlesOn}
            >
              <span>{subtitlesOn ? 'CC On' : 'CC Off'}</span>
            </button>

            <button type="button" className="dock-btn" onClick={() => setDossierOpen(true)}>
              <span>Brief (3)</span>
            </button>

            <button type="button" className="dock-btn" onClick={() => setLogOpen(true)}>
              <span>Call Log ({view.messages.length})</span>
            </button>

            <button type="button" className="dock-btn is-deal" onClick={() => setOfferOpen(true)}>
              <span>{view.deal ? `Offer: ${formatMoney(view.deal.price)}` : 'Propose Deal'}</span>
            </button>

            <button type="button" className="dock-btn is-hangup" onClick={() => setLeaveOpen(true)}>
              <span>End Call</span>
            </button>
          </div>

          {/* -------- COMPACT BOTTOM STRIP: SECRET OBJECTIVES + SHARED DEAL BAR -------- */}
          <div className="vc-bottom-grid room-pop">
            <div className="side-goals-card vc-goals-strip">
              <div className="side-goals-head">
                <span className="mono">YOUR PRIVATE BRIEF</span>
                <button type="button" className="link-btn" onClick={() => setDossierOpen(true)}>Expand</button>
              </div>
              <ol>
                {view.you.objectives.map((g, i) => (
                  <li key={i}>
                    <span>{g}</span>
                    <b className="mono tnum">+20</b>
                  </li>
                ))}
              </ol>
            </div>

            <div className="stage-console vc-deal-card">
              <div className="deal-shelf" style={{ borderTop: 0 }}>
                <div className="deal-shelf-main">
                  <div>
                    <div className="kicker mono" style={{ marginBottom: 4 }}>
                      {view.deal ? `ON-CALL AGREEMENT · REVISION #${view.revision}` : 'SHARED AGREEMENT TABLE'}
                    </div>
                    {view.deal ? (
                      <div className="deal-current">
                        <span className="deal-price display tnum">{formatMoney(view.deal.price)}</span>
                        <span className="deal-pkg">{activePkg?.name} — {activePkg?.detail}</span>
                      </div>
                    ) : (
                      <p className="deal-empty-copy">
                        Negotiate live over voice, then table an official offer ($4.50M–$6.00M) for both callers to sign.
                      </p>
                    )}
                  </div>

                  <div className="deal-shelf-buttons">
                    <button type="button" className="wise-pill wise-pill-soft" onClick={() => setOfferOpen(true)}>
                      {view.deal ? 'Revise terms' : 'Propose terms'}
                    </button>
                    {view.deal && !youConfirmed ? (
                      <button
                        type="button"
                        className="wise-pill wise-pill-confirm"
                        disabled={sending}
                        onClick={() => void act({ type: 'confirm', revision: view.revision })}
                      >
                        Sign rev #{view.revision} ✓
                      </button>
                    ) : null}
                    {view.phase === 'finalize' ? (
                      <button
                        type="button"
                        className="wise-pill wise-pill-danger"
                        disabled={sending}
                        onClick={() => void act({ type: 'decline' })}
                      >
                        Walk away
                      </button>
                    ) : null}
                  </div>
                </div>

                {view.deal ? (
                  <div className="deal-signatures">
                    <span className={`sig-pill ${youConfirmed ? 'is-signed' : ''}`}>
                      {youConfirmed ? '✓' : '○'} You ({view.you.short}) · {youConfirmed ? 'Signed' : 'Unsigned'}
                    </span>
                    <span className={`sig-pill is-partner ${peerConfirmed ? 'is-signed' : ''}`}>
                      {peerConfirmed ? '✓' : '○'} {view.peer?.short || 'Caller'} · {peerConfirmed ? 'Signed' : 'Unsigned'}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        packages={view.packages}
        initialPrice={view.deal?.price ?? (view.you.id === 'alex' ? 550 : 500)}
        initialPackage={view.deal?.package ?? 'phased'}
        roleId={view.you.id}
        busy={sending}
        onSubmit={async deal => {
          await act({ type: 'propose', deal });
          setOfferOpen(false);
        }}
      />

      {/* Spoken Transcript & Accessibility Fallback Note Drawer */}
      <Drawer open={logOpen} onClose={() => setLogOpen(false)} title="Spoken Call Log">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {view.messages.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Typed notes appear here. Optional CC can add browser-recognized speech; recognition may use your browser vendor.
            </p>
          ) : (
            view.messages.map(m => {
              const mine = m.speaker === view.you.id;
              return (
                <div key={m.id} className={`chat-bubble ${mine ? 'is-you' : 'is-them'}`} style={{ maxWidth: '100%' }}>
                  <div className="bubble-meta">
                    <span>{mine ? `🎙️ You (${view.you.short})` : `🔊 ${view.peer?.short || 'Caller'}`}</span>
                  </div>
                  <p>{m.text}</p>
                </div>
              );
            })
          )}
        </div>
        {view.phase === 'talk' ? (
          <form onSubmit={onSendFallbackNote} style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Send a typed note…"
              maxLength={1000}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 999,
                border: '1.5px solid var(--line-strong)',
                background: 'var(--surface-subtle)',
                color: 'var(--ink)',
              }}
            />
            <button type="submit" className="wise-pill wise-pill-solid" disabled={!draft.trim() || sending}>
              Send
            </button>
          </form>
        ) : null}
      </Drawer>

      <Drawer open={dossierOpen} onClose={() => setDossierOpen(false)} title={`Brief — ${view.you.name}`}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{view.you.context}</p>
        <h3 style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Secret goals</h3>
        <ul style={{ paddingLeft: 18, marginBottom: 20, display: 'grid', gap: 8 }}>
          {view.you.objectives.map((o, i) => <li key={i}>{o} (<strong>+20 pts</strong>)</li>)}
        </ul>
        {view.you.background.map(b => (
          <div key={b.title} style={{ padding: 12, borderRadius: 12, background: 'var(--surface-subtle)', marginBottom: 10 }}>
            <strong>{b.title}</strong>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>{b.text}</p>
          </div>
        ))}
      </Drawer>

      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Hang up this voice call?">
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Hanging up disconnects your voice stream immediately and ends the round incomplete with zero mission points.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setLeaveOpen(false)}>Stay on VC</button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              setLeaveOpen(false);
              voice.stopAll();
              await act({ type: 'leave' });
              navigate('/play');
            }}
          >
            Hang up
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function MicSvg({ off }: { off: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18M12 19v3m-4 0h8" />
        </>
      ) : (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
        </>
      )}
    </svg>
  );
}

function SpeakerSvg({ off }: { off: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      {off ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
    </svg>
  );
}
