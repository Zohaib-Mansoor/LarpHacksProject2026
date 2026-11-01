import { useEffect, useRef, useState } from 'react';

/** Records only this browser's permitted speaking turn; never mixes peer audio. */
export function useTurnRecording({ stream, enabled, code, round, turn }: {
  stream: MediaStream | null; enabled: boolean; code: string; round: number; turn: number | null;
}) {
  const [status, setStatus] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled || !stream || turn === null) return;
    const update = (text: string) => { if (mounted.current) setStatus(text); };
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
    if (!mime) { update('This browser cannot record speech for AI coaching.'); return; }
    const chunks: Blob[] = [];
    let size = 0;
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 }); }
    catch { update('Speech recording is unavailable; mission scoring still works.'); return; }
    recorder.ondataavailable = event => {
      size += event.data.size;
      if (size <= 1_000_000 && event.data.size) chunks.push(event.data);
      else if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.onstop = () => {
      if (!chunks.length || size > 1_000_000) { update('Speech clip unavailable; no AI score was invented.'); return; }
      update('Transcribing your speaking turn…');
      void (async () => {
        const blob = new Blob(chunks, { type: mime });
        const audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const response = await fetch('/api/vc/coaching/transcribe', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, round, turn, mime: mime.split(';')[0], audio }),
        });
        if (!response.ok) throw new Error('Speech upload failed. AI feedback may be unavailable.');
        const next = await response.json();
        update(next.coaching.failedClips ? 'Speech provider unavailable; mission scoring still works.' : 'Speaking turn transcribed.');
      })().catch(error => update(error instanceof Error ? error.message : 'Speech upload failed.'));
    };
    recorder.start(1000);
    update('Recording your turn for AI coaching');
    return () => { if (recorder.state !== 'inactive') recorder.stop(); };
  }, [stream, enabled, code, round, turn]);
  return status;
}
