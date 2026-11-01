import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, RoomView } from './api';

const BAR_COUNT = 20;
const EMPTY_BARS = Array.from({ length: BAR_COUNT }, () => 14);

interface SpeechRecInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function encodeInt16Base64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64Float32(b64: string): Float32Array {
  const bin = atob(b64);
  const len = bin.length >> 1;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const lo = bin.charCodeAt(i * 2);
    const hi = bin.charCodeAt(i * 2 + 1);
    let val = (hi << 8) | lo;
    if (val >= 0x8000) val -= 0x10000;
    out[i] = val / 32768;
  }
  return out;
}

function playCallChime(kind: 'connect' | 'hangup') {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = kind === 'connect' ? [523.25, 659.25] : [440, 329.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.2);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 500);
  } catch {}
}

function pickNaturalVoice(preferRole: 'alex' | 'morgan'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  if (voices.length === 0) return null;
  const preferredKeywords =
    preferRole === 'morgan'
      ? ['Aria Online', 'Jenny Online', 'Google US English', 'Natural', 'Samantha', 'Zira']
      : ['Guy Online', 'Christopher Online', 'Davis Online', 'Google UK English Male', 'Natural', 'David'];
  for (const kw of preferredKeywords) {
    const hit = voices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()));
    if (hit) return hit;
  }
  return voices[0];
}

export function useVoiceCall({
  code,
  token,
  phase,
  role,
  sparring,
  messages,
  onSpokenLine,
  onRoomPush,
}: {
  code: string;
  token: string | null;
  phase: RoomView['phase'] | null;
  role: 'alex' | 'morgan' | null;
  sparring: boolean;
  messages: ChatMessage[];
  onSpokenLine?: (text: string) => void;
  onRoomPush?: (next: RoomView) => void;
}) {
  const [micJoined, setMicJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pttMode, setPttMode] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [rtcState, setRtcState] = useState<'idle' | 'connecting' | 'connected' | 'relay' | 'sparring-voice'>('idle');
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const [micError, setMicError] = useState('');
  const [interimText, setInterimText] = useState('');
  const [peerInterim, setPeerInterim] = useState('');
  const [localBars, setLocalBars] = useState<number[]>(EMPTY_BARS);
  const [remoteBars, setRemoteBars] = useState<number[]>(EMPTY_BARS);
  const [youSpeaking, setYouSpeaking] = useState(false);
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);

  const lineOpen = phase === 'prep' || phase === 'talk' || phase === 'finalize';
  const talkActive = phase === 'talk' || phase === 'finalize';
  const effectivelyMuted = muted || (pttMode && !pttHeld);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteGainRef = useRef<GainNode | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const transceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const recRef = useRef<SpeechRecInstance | null>(null);
  const botSpeakingRef = useRef(false);
  const spokenMsgIdRef = useRef(0);
  const autoAttemptedRef = useRef(false);
  const signalHandlerRef = useRef<((item: { id: number; from: string; signal: any }) => void) | null>(null);
  const peerJoinedTriggerRef = useRef<(() => void) | null>(null);

  const effMutedRef = useRef(effectivelyMuted);
  effMutedRef.current = effectivelyMuted;
  const speakerMutedRef = useRef(speakerMuted);
  speakerMutedRef.current = speakerMuted;
  const rtcStateRef = useRef(rtcState);
  rtcStateRef.current = rtcState;
  const peerOnlineRef = useRef(peerOnline);
  peerOnlineRef.current = peerOnline;
  const talkActiveRef = useRef(talkActive);
  talkActiveRef.current = talkActive;
  const onSpokenRef = useRef(onSpokenLine);
  onSpokenRef.current = onSpokenLine;
  const onRoomPushRef = useRef(onRoomPush);
  onRoomPushRef.current = onRoomPush;

  const ensureAudioContext = useCallback(async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const remAnalyser = ctx.createAnalyser();
      remAnalyser.fftSize = 64;
      const remGain = ctx.createGain();
      remGain.gain.value = speakerMutedRef.current ? 0 : 1;
      remAnalyser.connect(remGain).connect(ctx.destination);
      audioCtxRef.current = ctx;
      remoteAnalyserRef.current = remAnalyser;
      remoteGainRef.current = remGain;
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    transceiverRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    remoteGainRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch {}
    botSpeakingRef.current = false;
    setMicJoined(false);
    setPartnerSpeaking(false);
    setYouSpeaking(false);
    setLocalBars(EMPTY_BARS);
    setRemoteBars(EMPTY_BARS);
  }, []);

  // Join microphone + wire live analyser + attach track to active WebRTC transceiver + fallback PCM streamer
  const joinMic = useCallback(async () => {
    setMicError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone requires localhost or HTTPS in a modern browser.');
      }
      if (streamRef.current) {
        await ensureAudioContext();
        setMicJoined(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(t => { t.enabled = !effMutedRef.current; });

      const ctx = await ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      localAnalyserRef.current = analyser;

      // Attach live mic track directly to existing WebRTC transceiver (instant, zero renegotiation drop)
      const micTrack = stream.getAudioTracks()[0];
      if (micTrack && transceiverRef.current) {
        await transceiverRef.current.sender.replaceTrack(micTrack).catch(() => {});
      }

      // Low-latency 16kHz PCM fallback relay (active ONLY when 2P WebRTC P2P is not yet connected)
      if (!sparring && token) {
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        const silence = ctx.createGain();
        silence.gain.value = 0;
        source.connect(proc);
        proc.connect(silence).connect(ctx.destination);
        proc.onaudioprocess = ev => {
          if (
            effMutedRef.current ||
            !talkActiveRef.current ||
            !peerOnlineRef.current ||
            rtcStateRef.current === 'connected'
          ) {
            return;
          }
          const input = ev.inputBuffer.getChannelData(0);
          const ratio = ctx.sampleRate / 16000;
          const outLen = Math.floor(input.length / ratio);
          const pcm16 = new Int16Array(outLen);
          let energy = 0;
          for (let i = 0; i < outLen; i++) {
            const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] || 0));
            energy += Math.abs(s);
            pcm16[i] = s < 0 ? s * 32768 : s * 32767;
          }
          // Voice activity gate so silent frames aren't transmitted
          if (energy / outLen < 0.006) return;
          if (rtcStateRef.current === 'connecting') setRtcState('relay');
          void fetch('/api/call-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ code, rate: 16000, pcm: encodeInt16Base64(pcm16) }),
          }).catch(() => {});
        };
        processorRef.current = proc;
      }

      setMicJoined(true);
      if (sparring) setRtcState('sparring-voice');
      playCallChime('connect');
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone permission denied.');
    }
  }, [code, token, sparring, ensureAudioContext]);

  // Auto-attempt microphone connection as soon as the call line opens
  useEffect(() => {
    if (!lineOpen || autoAttemptedRef.current || micJoined) return;
    autoAttemptedRef.current = true;
    void joinMic();
  }, [lineOpen, micJoined, joinMic]);

  // Sync hardware track enable state with mute / Push-to-Talk
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => {
      t.enabled = !effectivelyMuted;
    });
  }, [effectivelyMuted]);

  // Keyboard shortcuts: Hold [Space] for Push-to-Talk, [M] to mute, [D] to deafen
  useEffect(() => {
    if (!lineOpen) return;
    const isTypingTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && pttMode) {
        e.preventDefault();
        setPttHeld(true);
      } else if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
        setMuted(m => !m);
      } else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
        setSpeakerMuted(s => !s);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttMode) setPttHeld(false);
    };
    const onBlur = () => setPttHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [lineOpen, pttMode]);

  // Real-time SSE room & voice stream (/api/call-stream)
  useEffect(() => {
    if (!code || !token) return;
    const es = new EventSource(`/api/call-stream?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);

    es.addEventListener('hello', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setPeerOnline(Boolean(data.peerOnline));
      } catch {}
    });

    es.addEventListener('peer-presence', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        const online = Boolean(data.online);
        setPeerOnline(online);
        if (online) {
          playCallChime('connect');
          peerJoinedTriggerRef.current?.();
        }
      } catch {}
    });

    es.addEventListener('sync', (ev: MessageEvent) => {
      try {
        const view = JSON.parse(ev.data) as RoomView;
        onRoomPushRef.current?.(view);
      } catch {}
    });

    es.addEventListener('signal', (ev: MessageEvent) => {
      try {
        const item = JSON.parse(ev.data);
        signalHandlerRef.current?.(item);
      } catch {}
    });

    es.addEventListener('telemetry', (ev: MessageEvent) => {
      try {
        const t = JSON.parse(ev.data);
        setPeerMuted(Boolean(t.muted));
        if (typeof t.interim === 'string') setPeerInterim(t.interim);
      } catch {}
    });

    es.addEventListener('audio', (ev: MessageEvent) => {
      if (speakerMutedRef.current || rtcStateRef.current === 'connected') return;
      void (async () => {
        try {
          const payload = JSON.parse(ev.data) as { rate: number; pcm: string };
          const samples = decodeBase64Float32(payload.pcm);
          const ctx = await ensureAudioContext();
          const buf = ctx.createBuffer(1, samples.length, payload.rate || 16000);
          buf.getChannelData(0).set(samples);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          if (remoteAnalyserRef.current) src.connect(remoteAnalyserRef.current);
          else src.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
          src.start(startAt);
          nextPlayTimeRef.current = startAt + buf.duration;
          if (rtcStateRef.current !== 'connected') setRtcState('relay');
        } catch {}
      })();
    });

    return () => {
      es.close();
    };
  }, [code, token, ensureAudioContext]);

  // Two-Player Glare-Safe WebRTC Audio Connection (connects immediately even before mic is unmuted!)
  useEffect(() => {
    if (!lineOpen || sparring || !token || !role || !code) return;

    const polite = role === 'morgan';
    let makingOffer = false;
    let ignoreOffer = false;
    const pendingIce: RTCIceCandidateInit[] = [];

    const postSignal = async (signal: unknown) => {
      await fetch('/api/call-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, signal }),
      }).catch(() => {});
    };

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    pcRef.current = pc;
    setRtcState('connecting');

    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    transceiverRef.current = transceiver;
    const existingTrack = streamRef.current?.getAudioTracks()[0];
    if (existingTrack) {
      void transceiver.sender.replaceTrack(existingTrack).catch(() => {});
    }

    const sendOffer = async () => {
      try {
        makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          await postSignal({ description: pc.localDescription.toJSON() });
        }
      } catch {
      } finally {
        makingOffer = false;
      }
    };

    pc.onnegotiationneeded = () => {
      if (role === 'alex') void sendOffer();
    };

    pc.onicecandidate = ev => {
      if (ev.candidate) void postSignal({ candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = ev => {
      const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = speakerMutedRef.current;
      audio.srcObject = remoteStream;
      remoteAudioRef.current = audio;
      void audio.play().catch(() => {});
      void ensureAudioContext().then(ctx => {
        try {
          const remAnalyser = ctx.createAnalyser();
          remAnalyser.fftSize = 64;
          ctx.createMediaStreamSource(remoteStream).connect(remAnalyser);
          remoteAnalyserRef.current = remAnalyser;
        } catch {}
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setRtcState('connected');
      } else if (pc.connectionState === 'failed' && role === 'alex') {
        try { pc.restartIce(); } catch {}
      }
    };

    signalHandlerRef.current = async ({ signal }) => {
      if (!signal) return;
      try {
        if (signal.description) {
          const desc = signal.description as RTCSessionDescriptionInit;
          const offerCollision = desc.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
          ignoreOffer = !polite && offerCollision;
          if (ignoreOffer) return;

          await pc.setRemoteDescription(desc);
          for (const c of pendingIce.splice(0)) {
            await pc.addIceCandidate(c).catch(() => {});
          }
          if (desc.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              await postSignal({ description: pc.localDescription.toJSON() });
            }
          }
        } else if (signal.candidate) {
          if (!ignoreOffer) {
            if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => {});
            else pendingIce.push(signal.candidate);
          }
        }
      } catch {}
    };

    peerJoinedTriggerRef.current = () => {
      if (role === 'alex' && pc.connectionState !== 'connected') {
        void sendOffer();
      }
    };

    if (role === 'alex') void sendOffer();

    return () => {
      signalHandlerRef.current = null;
      peerJoinedTriggerRef.current = null;
      transceiverRef.current = null;
      pc.close();
      pcRef.current = null;
    };
  }, [lineOpen, sparring, token, role, code, ensureAudioContext]);

  // Continuous Browser SpeechRecognition for live captions & hands-free voice turns (+ barge-in!)
  useEffect(() => {
    if (!talkActive || !micJoined || effectivelyMuted) {
      setInterimText('');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    let alive = true;
    const rec: SpeechRecInstance = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (ev: any) => {
      if (!alive || effMutedRef.current) return;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = String(res[0]?.transcript || '').trim();
        if (res.isFinal && txt) {
          // Barge-in: stop AI speech immediately when user speaks
          if (botSpeakingRef.current) {
            try { window.speechSynthesis?.cancel(); } catch {}
            botSpeakingRef.current = false;
          }
          setInterimText('');
          if (!sparring && token) {
            void fetch('/api/call-telemetry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ code, speaking: false, muted: false, interim: '' }),
            }).catch(() => {});
          }
          onSpokenRef.current?.(txt);
        } else {
          interim += txt + ' ';
        }
      }
      const cleanInterim = interim.trim();
      if (cleanInterim.length > 2 && botSpeakingRef.current) {
        try { window.speechSynthesis?.cancel(); } catch {}
        botSpeakingRef.current = false;
      }
      setInterimText(cleanInterim);
      if (!sparring && token && cleanInterim) {
        void fetch('/api/call-telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code, speaking: true, muted: false, interim: cleanInterim }),
        }).catch(() => {});
      }
    };

    rec.onerror = () => {};
    rec.onend = () => {
      if (alive && !effMutedRef.current && talkActiveRef.current) {
        setTimeout(() => {
          if (alive) {
            try { rec.start(); } catch {}
          }
        }, 180);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {}

    return () => {
      alive = false;
      try { rec.stop(); } catch {}
      if (recRef.current === rec) recRef.current = null;
    };
  }, [talkActive, micJoined, effectivelyMuted, sparring, token, code]);

  // Broadcast mute state changes to peer
  useEffect(() => {
    if (sparring || !token || !lineOpen) return;
    void fetch('/api/call-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, speaking: false, muted: effectivelyMuted, interim: '' }),
    }).catch(() => {});
  }, [effectivelyMuted, sparring, token, code, lineOpen]);

  // 60fps Audio Spectrum Meter Loop (20 bars each for You & Stranger)
  useEffect(() => {
    const sampleBars = (analyser: AnalyserNode | null, isSilenced: boolean): { bars: number[]; speaking: boolean } => {
      if (!analyser || isSilenced) return { bars: EMPTY_BARS, speaking: false };
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = Math.min(buf.length - 1, Math.floor((i / BAR_COUNT) * Math.min(buf.length, 24)) + 1);
        const v = buf[idx] || 0;
        sum += v;
        return Math.max(14, Math.min(100, Math.round((v / 255) * 105)));
      });
      return { bars, speaking: sum / BAR_COUNT > 18 };
    };

    let tick = 0;
    const loop = () => {
      tick += 1;
      if (localAnalyserRef.current) {
        const loc = sampleBars(localAnalyserRef.current, effectivelyMuted);
        setLocalBars(loc.bars);
        setYouSpeaking(loc.speaking);
      } else {
        setLocalBars(EMPTY_BARS);
        setYouSpeaking(false);
      }

      if (!sparring && remoteAnalyserRef.current) {
        const rem = sampleBars(remoteAnalyserRef.current, speakerMuted);
        setRemoteBars(rem.bars);
        setPartnerSpeaking(rem.speaking);
      } else if (botSpeakingRef.current && !speakerMuted) {
        const synthBars = Array.from({ length: BAR_COUNT }, (_, i) =>
          Math.round(24 + 62 * Math.abs(Math.sin(tick * 0.17 + i * 0.55)) * (0.5 + 0.5 * Math.cos(tick * 0.08 - i * 0.4)))
        );
        setRemoteBars(synthBars);
        setPartnerSpeaking(true);
      } else {
        setRemoteBars(EMPTY_BARS);
        setPartnerSpeaking(false);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [effectivelyMuted, speakerMuted, sparring]);

  // Speak Sparring Partner lines aloud via natural Web Speech Synthesis
  useEffect(() => {
    if (!sparring || !talkActive || !role || speakerMuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const partnerMsgs = messages.filter(m => m.speaker !== role && m.id > spokenMsgIdRef.current);
    if (partnerMsgs.length === 0) return;
    const latest = partnerMsgs[partnerMsgs.length - 1];
    spokenMsgIdRef.current = latest.id;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(latest.text);
      const voice = pickNaturalVoice(latest.speaker);
      if (voice) utter.voice = voice;
      utter.rate = 1.04;
      utter.pitch = latest.speaker === 'morgan' ? 1.05 : 0.96;
      utter.onstart = () => { botSpeakingRef.current = true; };
      utter.onend = () => { botSpeakingRef.current = false; };
      utter.onerror = () => { botSpeakingRef.current = false; };
      window.speechSynthesis.speak(utter);
    } catch {}
  }, [messages, sparring, talkActive, role, speakerMuted]);

  const toggleMute = useCallback(() => {
    setMuted(m => !m);
  }, []);

  const togglePttMode = useCallback(() => {
    setPttMode(p => !p);
    setPttHeld(false);
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerMuted(s => {
      const next = !s;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
      if (remoteGainRef.current) remoteGainRef.current.gain.value = next ? 0 : 1;
      if (next) {
        try { window.speechSynthesis?.cancel(); } catch {}
        botSpeakingRef.current = false;
      }
      return next;
    });
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  return {
    micJoined,
    muted,
    effectivelyMuted,
    pttMode,
    pttHeld,
    speakerMuted,
    rtcState,
    peerOnline,
    peerMuted,
    micError,
    interimText,
    peerInterim,
    localBars,
    remoteBars,
    youSpeaking,
    partnerSpeaking,
    joinMic,
    toggleMute,
    togglePttMode,
    toggleSpeaker,
    stopAll,
  };
}
