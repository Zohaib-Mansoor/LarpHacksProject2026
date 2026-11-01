import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from './api';

const EMPTY_BARS = [14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14];

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

export function useVoiceCall({
  code,
  token,
  active,
  role,
  sparring,
  messages,
  onSpokenLine,
}: {
  code: string;
  token: string | null;
  active: boolean;
  role: 'alex' | 'morgan' | null;
  sparring: boolean;
  messages: ChatMessage[];
  onSpokenLine?: (text: string) => void;
}) {
  const [micJoined, setMicJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [rtcState, setRtcState] = useState<'idle' | 'connecting' | 'connected' | 'sparring-voice'>('idle');
  const [micError, setMicError] = useState('');
  const [interimText, setInterimText] = useState('');
  const [localBars, setLocalBars] = useState<number[]>(EMPTY_BARS);
  const [remoteBars, setRemoteBars] = useState<number[]>(EMPTY_BARS);
  const [youSpeaking, setYouSpeaking] = useState(false);
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cursorRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const recRef = useRef<SpeechRecInstance | null>(null);
  const botSpeakingRef = useRef(false);
  const spokenMsgIdRef = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const speakerMutedRef = useRef(speakerMuted);
  speakerMutedRef.current = speakerMuted;
  const activeRef = useRef(active);
  activeRef.current = active;
  const onSpokenRef = useRef(onSpokenLine);
  onSpokenRef.current = onSpokenLine;

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
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
    try { window.speechSynthesis?.cancel(); } catch {}
    botSpeakingRef.current = false;
    setMicJoined(false);
    setPartnerSpeaking(false);
    setYouSpeaking(false);
    setLocalBars(EMPTY_BARS);
    setRemoteBars(EMPTY_BARS);
  }, []);

  // Join microphone + start audio analyser (+ SpeechRecognition in sparring)
  const joinMic = useCallback(async () => {
    setMicError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires localhost or HTTPS in a modern browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      await ctx.resume();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      localAnalyserRef.current = analyser;
      setMicJoined(true);
      setRtcState(sparring ? 'sparring-voice' : 'connecting');

      // Start browser speech recognition for hands-free spoken turns
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec: SpeechRecInstance = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.onresult = (ev: any) => {
          if (mutedRef.current || botSpeakingRef.current) return;
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            const txt = String(res[0]?.transcript || '').trim();
            if (res.isFinal && txt) {
              setInterimText('');
              onSpokenRef.current?.(txt);
            } else {
              interim += txt + ' ';
            }
          }
          setInterimText(interim.trim());
        };
        rec.onerror = () => {};
        rec.onend = () => {
          if (streamRef.current && activeRef.current && !mutedRef.current) {
            try { rec.start(); } catch {}
          }
        };
        try { rec.start(); recRef.current = rec; } catch {}
      }
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone permission denied.');
    }
  }, [sparring]);

  // Meter loop for both local & remote audio bars
  useEffect(() => {
    const sampleBars = (analyser: AnalyserNode | null, isMuted: boolean): { bars: number[]; speaking: boolean } => {
      if (!analyser || isMuted) return { bars: EMPTY_BARS, speaking: false };
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      const bars = Array.from({ length: 12 }, (_, i) => {
        const v = buf[Math.min(buf.length - 1, i + 1)] || 0;
        sum += v;
        return Math.max(12, Math.min(100, Math.round((v / 255) * 100)));
      });
      return { bars, speaking: sum / 12 > 22 };
    };

    let tick = 0;
    const loop = () => {
      tick += 1;
      if (localAnalyserRef.current) {
        const loc = sampleBars(localAnalyserRef.current, muted);
        setLocalBars(loc.bars);
        setYouSpeaking(loc.speaking);
      }
      if (remoteAnalyserRef.current && !sparring) {
        const rem = sampleBars(remoteAnalyserRef.current, speakerMuted);
        setRemoteBars(rem.bars);
        setPartnerSpeaking(rem.speaking);
      } else if (botSpeakingRef.current && !speakerMuted) {
        // Organic animated voice waveform while TTS voice speaks
        const synthBars = Array.from({ length: 12 }, (_, i) =>
          Math.round(28 + 56 * Math.abs(Math.sin(tick * 0.16 + i * 0.75)) * (0.55 + 0.45 * Math.cos(tick * 0.09 - i)))
        );
        setRemoteBars(synthBars);
        setPartnerSpeaking(true);
      } else if (sparring) {
        setRemoteBars(EMPTY_BARS);
        setPartnerSpeaking(false);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [muted, speakerMuted, sparring]);

  // Two-player WebRTC peer connection & signaling poll
  useEffect(() => {
    if (!active || sparring || !micJoined || !token || !role || !streamRef.current) return;

    let cancelled = false;
    const postSignal = async (signal: unknown) => {
      await fetch('/api/call-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, signal }),
      }).catch(() => {});
    };

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;
    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));

    pc.onicecandidate = ev => {
      if (ev.candidate) void postSignal({ kind: 'ice', candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = ev => {
      const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = speakerMutedRef.current;
      audio.srcObject = remoteStream;
      remoteAudioRef.current = audio;
      void audio.play().catch(() => {});
      if (audioCtxRef.current) {
        const remAnalyser = audioCtxRef.current.createAnalyser();
        remAnalyser.fftSize = 64;
        audioCtxRef.current.createMediaStreamSource(remoteStream).connect(remAnalyser);
        remoteAnalyserRef.current = remAnalyser;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setRtcState('connected');
      else if (pc.connectionState === 'connecting') setRtcState('connecting');
    };

    const pendingIce: RTCIceCandidateInit[] = [];

    if (role === 'alex') {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) void postSignal({ kind: 'offer', sdp: pc.localDescription.toJSON() });
        })
        .catch(() => {});
    }

    const poll = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/call-signal?code=${encodeURIComponent(code)}&after=${cursorRef.current}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { signals: { id: number; signal: any }[]; cursor: number };
        for (const item of body.signals) {
          cursorRef.current = Math.max(cursorRef.current, item.id);
          const sig = item.signal;
          if (!sig) continue;
          if (sig.kind === 'offer' && role === 'morgan') {
            await pc.setRemoteDescription(sig.sdp);
            for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            if (pc.localDescription) await postSignal({ kind: 'answer', sdp: pc.localDescription.toJSON() });
          } else if (sig.kind === 'answer' && role === 'alex' && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(sig.sdp);
            for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c);
          } else if (sig.kind === 'ice' && sig.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(sig.candidate);
            else pendingIce.push(sig.candidate);
          }
        }
      } catch {}
    }, 850);

    return () => {
      cancelled = true;
      clearInterval(poll);
      pc.close();
      pcRef.current = null;
    };
  }, [active, sparring, micJoined, token, role, code]);

  // Speak Sparring Partner lines aloud via Web Speech Synthesis
  useEffect(() => {
    if (!sparring || !active || !role || speakerMuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const partnerMsgs = messages.filter(m => m.speaker !== role && m.id > spokenMsgIdRef.current);
    if (partnerMsgs.length === 0) return;
    const latest = partnerMsgs[partnerMsgs.length - 1];
    spokenMsgIdRef.current = latest.id;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(latest.text);
      utter.rate = 1.03;
      utter.pitch = latest.speaker === 'morgan' ? 1.08 : 0.94;
      utter.onstart = () => { botSpeakingRef.current = true; };
      utter.onend = () => { botSpeakingRef.current = false; };
      utter.onerror = () => { botSpeakingRef.current = false; };
      window.speechSynthesis.speak(utter);
    } catch {}
  }, [messages, sparring, active, role, speakerMuted]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      if (next) setInterimText('');
      else {
        try { recRef.current?.start(); } catch {}
      }
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerMuted(s => {
      const next = !s;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
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
    speakerMuted,
    rtcState,
    micError,
    interimText,
    localBars,
    remoteBars,
    youSpeaking,
    partnerSpeaking,
    joinMic,
    toggleMute,
    toggleSpeaker,
    stopAll,
  };
}
