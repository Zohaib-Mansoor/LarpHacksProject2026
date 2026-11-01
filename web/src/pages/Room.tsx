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
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [offerOpen, setOfferOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!token) return;
      setSending(true);
      try {
        const next = await sendRoomAction(roomCode, token, payload);
        setServerOffset(next.serverNow - Date.now());
        setView(next);
        if (next.phase === 'complete' || next.phase === 'incomplete') {
          if (next.result) recordCompletedRound(next);
          navigate(`/results/${roomCode}`, { replace: true });
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setSending(false);
      }
    },
    [token, roomCode, navigate, toast],
  );

  const callActive = view?.phase === 'talk' || view?.phase === 'finalize';
  const voice = useVoiceCall({
    code: roomCode,
    token,
    active: !!callActive,
    role: view?.you.id ?? null,
    sparring: !!view?.sparring,
    messages: view?.messages ?? [],
    onSpokenLine: text => {
      if (view?.phase === 'talk') void act({ type: 'message', text });
    },
  });

  const sync = useCallback(async () => {
    if (!token || !roomCode) return;
    try {
      const next = await fetchRoom(roomCode, token);
      setServerOffset(next.serverNow - Date.now());
      setView(next);
      setError('');
      if (next.phase === 'complete' || next.phase === 'incomplete') {
        voice.stopAll();
        if (next.result) {
          recordCompletedRound(next);
          const prof = getProfile();
          if (prof.leaderboardOptIn && prof.callsign) {
            void submitLeaderboardScore(roomCode, token, prof.callsign).catch(() => {});
          }
        }
        navigate(`/results/${roomCode}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach room.');
    }
  }, [token, roomCode, navigate, voice]);

  useEffect(() => {
    if (!token) return;
    void sync();
    const id = setInterval(() => void sync(), 1100);
    return () => clearInterval(id);
  }, [token, sync]);

  useEffect(() => {
    if (!view) return;
    if (view.messages.length > prevMsgCount.current) {
      prevMsgCount.current = view.messages.length;
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [view]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.room-pop', { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.05, ease: 'expo.out' });
    }, el);
    return () => ctx.revert();
  }, [view?.phase]);

  async function onSendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await act({ type: 'message', text });
  }

  async function handleDirectJoin() {
    setJoiningDirect(true);
    setError('');
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
      const spar = await startSparring();
      navigate(`/room/${spar.code}`, { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start sparring call.');
    }
  }

  if (!token) {
    return (
      <div className="flow-page">
        <FlowStepperHeader step={0} badge="2P" closeTo="/play" />
        <div className="flow-column">
          <div className="dossier-card">
            <span className="kicker mono">VOICE CALL INVITE · {roomCode}</span>
            <h1 className="display" style={{ fontSize: 'clamp(36px, 5vw, 56px)', marginBottom: 12 }}>Join Call {roomCode}</h1>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
              Step into a 5-minute camera-free audio call with a secret identity and three mission objectives.
            </p>
            {error ? <div className="notice notice-danger" style={{ marginBottom: 16 }}>{error}</div> : null}
            <button type="button" className="wise-cta-wide" disabled={joiningDirect} onClick={() => void handleDirectJoin()}>
              {joiningDirect ? 'Connecting to call…' : `Join audio room ${roomCode}`}
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
            <p className="mono" style={{ color: 'var(--muted)' }}>DIALING ROOM {roomCode}…</p>
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

  return (
    <div className="flow-page" ref={stageRef}>
      <FlowStepperHeader step={stepIndex} badge={badge} onClose={() => setLeaveOpen(true)} />

      {/* ---------------- WAITING FOR CALLER ---------------- */}
      {view.phase === 'waiting' ? (
        <div className="flow-column">
          <div className="waiting-card room-pop">
            <span className="waiting-pulse" aria-hidden="true" />
            <p className="kicker mono">LINE OPEN · WAITING FOR CALLER</p>
            <div className="room-code-giant mono tnum">{view.code}</div>
            <p className="waiting-copy">
              Share this 6-character code or open a second tab/browser to connect on live WebRTC audio. Your secret role (<strong>{view.you.name}</strong>) is ready.
            </p>
            <div className="waiting-actions">
              <button
                type="button"
                className="wise-pill wise-pill-solid"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl);
                  toast('Call invite link copied');
                }}
              >
                Copy call link
              </button>
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="wise-pill wise-pill-soft">
                Open 2nd caller tab ↗
              </a>
              <button type="button" className="wise-pill wise-pill-orange" onClick={() => void switchToSparring()}>
                Call Voice Sparring Partner ⚡
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- PREP: PRIVATE BRIEF + MIC CHECK ---------------- */}
      {view.phase === 'prep' ? (
        <div className="prep-wrap">
          <div className="dossier-card room-pop">
            <div className="dossier-top-row">
              <div>
                <p className="kicker mono">PRE-CALL BRIEF — {view.you.name.toUpperCase()}</p>
                <h1 className="display dossier-hero-name">{view.you.role}</h1>
                <p className="dossier-employer">{view.you.employer} · Call identity: <strong>{view.you.name}</strong></p>
              </div>
              <CountdownRing deadline={view.deadline} serverOffset={serverOffset} totalSeconds={45} label="Pre-call brief" paused={view.paused} />
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

            <div className="dossier-intel-grid">
              {view.you.background.map(b => (
                <div key={b.title} className="intel-box">
                  <strong>{b.title}</strong>
                  <p>{b.text}</p>
                </div>
              ))}
            </div>

            <div className="dossier-footer-bar">
              <div className="ready-pills">
                <button
                  type="button"
                  className={`wise-pill ${voice.micJoined ? 'wise-pill-confirm' : 'wise-pill-soft'}`}
                  onClick={() => void voice.joinMic()}
                >
                  {voice.micJoined ? '🎙️ Mic checked ✓' : '🎙️ Enable microphone'}
                </button>
                <span className={`status-tag ${view.you.ready ? 'is-ready' : ''}`}>
                  You: {view.you.ready ? 'Ready ✓' : 'In greenroom'}
                </span>
                <span className={`status-tag is-partner ${view.peer?.ready ? 'is-ready' : ''}`}>
                  {view.peer?.short || 'Caller'}: {view.peer?.ready ? 'Ready ✓' : 'In greenroom'}
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
                {view.you.ready ? 'Connecting call…' : 'Join live call →'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- LIVE AUDIO CALL STAGE (TALK / FINALIZE) ---------------- */}
      {(view.phase === 'talk' || view.phase === 'finalize') ? (
        <div className="stage-shell">
          <div className="stage-topbar room-pop">
            <div>
              <span className="kicker mono">
                LIVE AUDIO CALL · ROOM {view.code} · ROUND {view.round} {view.sparring ? '· VOICE SPARRING' : '· WEBRTC P2P'}
              </span>
              <h1 className="stage-title">The Satellite Deal</h1>
            </div>
            <div className="stage-topbar-right">
              <button type="button" className="wise-pill wise-pill-soft" onClick={() => setDossierOpen(true)}>
                Secret brief
              </button>
              <CountdownRing
                deadline={view.deadline}
                serverOffset={serverOffset}
                totalSeconds={view.phase === 'finalize' ? 45 : 300}
                label={view.phase === 'finalize' ? 'Sign window' : 'On the call'}
                paused={view.paused}
              />
            </div>
          </div>

          {voice.micError ? (
            <div className="notice" style={{ marginBottom: 14 }}>
              Microphone note: {voice.micError} — You can still listen to your partner and send spoken notes below.
            </div>
          ) : null}

          {/* -------- TWO-CALLER AUDIO STAGE TILES (Google Meet x Wise) -------- */}
          <section className="call-stage-tiles room-pop" aria-label="Callers on the line">
            {/* YOU (BLUE) */}
            <article className={`caller-tile is-you${voice.youSpeaking ? ' is-speaking' : ''}`}>
              <div className="caller-tile-top">
                <span className="caller-chan-pill is-you">YOU · BLUE LINE</span>
                <span className={`caller-mic-state${voice.micJoined && !voice.muted ? ' is-live' : ''}`}>
                  {!voice.micJoined ? 'Mic off' : voice.muted ? 'Muted' : voice.youSpeaking ? 'Speaking' : 'Mic live'}
                </span>
              </div>

              <div className="caller-center">
                <div className={`caller-orb is-you${voice.youSpeaking ? ' is-pulsing' : ''}`}>
                  <span>{view.you.id === 'alex' ? 'AV' : 'MR'}</span>
                </div>
                <div className="caller-identity">
                  <strong>{view.you.name}</strong>
                  <small>{view.you.role} · {view.you.employer}</small>
                </div>
              </div>

              <div className="waveform" aria-hidden="true">
                {voice.localBars.map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>

              {voice.interimText ? (
                <div className="live-speech-pill">🎙️ “{voice.interimText}…”</div>
              ) : !voice.micJoined ? (
                <button type="button" className="join-mic-inline" onClick={() => void voice.joinMic()}>
                  🎙️ Tap to turn on your microphone
                </button>
              ) : null}
            </article>

            {/* PARTNER (ORANGE) */}
            <article className={`caller-tile is-them${voice.partnerSpeaking ? ' is-speaking' : ''}`}>
              <div className="caller-tile-top">
                <span className="caller-chan-pill is-them">STRANGER · ORANGE LINE</span>
                <span className={`caller-mic-state is-them${voice.partnerSpeaking ? ' is-live' : ''}`}>
                  {voice.speakerMuted
                    ? 'Speaker muted'
                    : voice.partnerSpeaking
                    ? 'Speaking…'
                    : view.sparring
                    ? 'Voice synthesis active'
                    : voice.rtcState === 'connected'
                    ? 'WebRTC audio live'
                    : 'Line connected'}
                </span>
              </div>

              <div className="caller-center">
                <div className={`caller-orb is-them${voice.partnerSpeaking ? ' is-pulsing' : ''}`}>
                  <span>{view.peer?.id === 'alex' ? 'AV' : 'MR'}</span>
                </div>
                <div className="caller-identity">
                  <strong>{view.peer?.name || 'Anonymous caller'}</strong>
                  <small>{view.peer ? `${view.peer.role} · ${view.peer.employer}` : 'Connecting audio…'}</small>
                </div>
              </div>

              <div className="waveform is-them" aria-hidden="true">
                {voice.remoteBars.map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </article>
          </section>

          {/* -------- FLOATING CALL DOCK -------- */}
          <div className="call-dock room-pop" role="toolbar" aria-label="Call controls">
            {!voice.micJoined ? (
              <button type="button" className="dock-btn is-primary-mic" onClick={() => void voice.joinMic()}>
                <MicSvg off={false} />
                <span>Join Mic</span>
              </button>
            ) : (
              <button
                type="button"
                className={`dock-btn${voice.muted ? ' is-muted' : ' is-active'}`}
                onClick={voice.toggleMute}
                aria-pressed={voice.muted}
              >
                <MicSvg off={voice.muted} />
                <span>{voice.muted ? 'Unmute' : 'Mic On'}</span>
              </button>
            )}

            <button
              type="button"
              className={`dock-btn${voice.speakerMuted ? ' is-muted' : ''}`}
              onClick={voice.toggleSpeaker}
              aria-pressed={voice.speakerMuted}
            >
              <SpeakerSvg off={voice.speakerMuted} />
              <span>{voice.speakerMuted ? 'Speaker Off' : 'Speaker'}</span>
            </button>

            <button
              type="button"
              className={`dock-btn${captionsOpen ? ' is-active-soft' : ''}`}
              onClick={() => setCaptionsOpen(v => !v)}
              aria-pressed={captionsOpen}
            >
              <span>{captionsOpen ? 'Captions On' : 'Captions Off'}</span>
            </button>

            <button type="button" className="dock-btn" onClick={() => setDossierOpen(true)}>
              <span>Brief (3 goals)</span>
            </button>

            <button type="button" className="dock-btn is-deal" onClick={() => setOfferOpen(true)}>
              <span>{view.deal ? `Edit Offer (${formatMoney(view.deal.price)})` : 'Propose Deal'}</span>
            </button>

            <button type="button" className="dock-btn is-hangup" onClick={() => setLeaveOpen(true)}>
              <span>End Call</span>
            </button>
          </div>

          {/* -------- SHARED PROPOSAL SHELF + LIVE CALL CAPTIONS -------- */}
          <div className="stage-grid" style={{ marginTop: 18 }}>
            <aside className="stage-side room-pop">
              <div className="side-goals-card">
                <div className="side-goals-head">
                  <span className="mono">YOUR SECRET GOALS</span>
                  <button type="button" className="link-btn" onClick={() => setDossierOpen(true)}>Full brief</button>
                </div>
                <ol>
                  {view.you.objectives.map((g, i) => (
                    <li key={i}>
                      <span>{g}</span>
                      <b className="mono tnum">+20</b>
                    </li>
                  ))}
                </ol>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                  Opening cue: “{view.you.cue}”
                </p>
              </div>
            </aside>

            <section className="stage-console room-pop" aria-label="Shared proposal and live call captions">
              {/* Shared Proposal Shelf on top for quick signing during call */}
              <div className="deal-shelf" style={{ borderTop: 0, borderBottom: captionsOpen ? '1px solid var(--line)' : 0 }}>
                <div className="deal-shelf-main">
                  <div>
                    <div className="kicker mono" style={{ marginBottom: 4 }}>
                      {view.deal ? `SHARED CALL PROPOSAL · REVISION #${view.revision}` : 'SHARED AGREEMENT TABLE'}
                    </div>
                    {view.deal ? (
                      <div className="deal-current">
                        <span className="deal-price display tnum">{formatMoney(view.deal.price)}</span>
                        <span className="deal-pkg">{activePkg?.name} — {activePkg?.detail}</span>
                      </div>
                    ) : (
                      <p className="deal-empty-copy">Talk through what each side needs, then table an offer ($4.50M–$6.00M).</p>
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
                        Confirm rev #{view.revision} ✓
                      </button>
                    ) : null}
                    {view.phase === 'finalize' ? (
                      <button
                        type="button"
                        className="wise-pill wise-pill-danger"
                        disabled={sending}
                        onClick={() => void act({ type: 'decline' })}
                      >
                        No deal
                      </button>
                    ) : null}
                  </div>
                </div>

                {view.deal ? (
                  <div className="deal-signatures">
                    <span className={`sig-pill ${youConfirmed ? 'is-signed' : ''}`}>
                      {youConfirmed ? '✓' : '○'} You ({view.you.short}) · {youConfirmed ? 'Confirmed' : 'Pending'}
                    </span>
                    <span className={`sig-pill is-partner ${peerConfirmed ? 'is-signed' : ''}`}>
                      {peerConfirmed ? '✓' : '○'} {view.peer?.short || 'Caller'} · {peerConfirmed ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                ) : null}
              </div>

              {captionsOpen ? (
                <>
                  <div className="chat-stream" style={{ minHeight: 220, maxHeight: 300 }} role="log" aria-live="polite">
                    {view.messages.length === 0 ? (
                      <div className="chat-empty">
                        <p className="chat-empty-title">Live call captions &amp; side-channel notes</p>
                        <p className="chat-empty-sub">
                          Speak into your mic (hands-free transcription) or drop a quick line below to kick off the call.
                        </p>
                        <button type="button" className="wise-pill wise-pill-soft" onClick={() => setDraft(view.you.cue)}>
                          Insert opening line
                        </button>
                      </div>
                    ) : (
                      view.messages.map(m => {
                        const mine = m.speaker === view.you.id;
                        return (
                          <div key={m.id} className={`chat-bubble ${mine ? 'is-you' : 'is-them'}`}>
                            <div className="bubble-meta">
                              <span>{mine ? `🎙️ You · ${view.you.short}` : `🔊 ${view.peer?.short || 'Caller'}`}</span>
                              {m.timestamp ? (
                                <time className="mono tnum">
                                  {new Date(m.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                                </time>
                              ) : null}
                            </div>
                            <p>{m.text}</p>
                          </div>
                        );
                      })
                    )}
                    <div ref={feedEndRef} />
                  </div>

                  {view.phase === 'talk' ? (
                    <form className="chat-composer" onSubmit={onSendMessage}>
                      <input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder={voice.micJoined && !voice.muted ? 'Mic is listening live — or type a side note / number here…' : 'Type a spoken line or enable your mic above…'}
                        maxLength={1000}
                        disabled={view.paused}
                        aria-label="Spoken note or clarification"
                      />
                      <button type="submit" className="wise-pill wise-pill-solid" disabled={!draft.trim() || sending || view.paused}>
                        Say →
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
            </section>
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

      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Hang up this call?">
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Hanging up disconnects your microphone immediately and ends the round incomplete with zero mission points.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setLeaveOpen(false)}>Stay on call</button>
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
