// Browser-only helper: the React app can import this without any server scenario code.
export type VoiceOptions = {
  baseUrl: string;
  roomId: string;
  roundId: string;
  transcribe: boolean;
  onRemoteStream: (stream: MediaStream) => void;
  onTranscript?: (event: {
    type: string;
    text?: string;
    segment?: { id: string; seat: number; text: string; atMs: number };
  }) => void;
  onError: (error: Error) => void;
};

type Signal =
  | { type: 'offer' | 'answer'; sdp: string; connectionId: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; connectionId: string };

export async function startNegotiationCall(options: VoiceOptions) {
  const root = `${options.baseUrl}/api/rooms/${options.roomId}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(root + path, {
      credentials: 'include',
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        `Call request failed (${response.status}). Refresh the room.`,
      );
    return response.json();
  };
  const requestedAt = performance.now();
  const config = (await request(`/rtc/config?roundId=${options.roundId}`)) as {
    iceServers: RTCIceServer[];
    initiator: boolean;
    directOnly: boolean;
    serverTime: number;
    roundEndsAt: number;
  };
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  const pc = new RTCPeerConnection({ iceServers: config.iceServers });
  let speech: WebSocket | undefined;
  let context: AudioContext | undefined;
  let closed = false;
  let cursor = 0;
  let connectionId: string | null = config.initiator
    ? crypto.randomUUID()
    : null;
  const waiting = new Map<string, RTCIceCandidateInit[]>();
  let poll: ReturnType<typeof setTimeout> | undefined;
  let end: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    if (poll) clearTimeout(poll);
    if (end) clearTimeout(end);
    speech?.close();
    pc.close();
    for (const track of mic.getTracks()) track.stop();
    void context?.close();
  };
  const fail = (error: unknown) => {
    close();
    options.onError(error instanceof Error ? error : new Error('Call failed.'));
  };
  const send = (signal: Signal) =>
    request('/rtc/signals', { roundId: options.roundId, signal });
  pc.ontrack = (event) =>
    options.onRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
  pc.onicecandidate = (event) => {
    if (event.candidate && connectionId) {
      if (config.directOnly && event.candidate.type === 'relay') return;
      void send({
        type: 'ice',
        connectionId,
        candidate: event.candidate.toJSON(),
      }).catch(fail);
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed')
      fail(
        new Error(
          'Direct connection failed. This network may require TURN relay; relay is disabled unless configured.',
        ),
      );
    if (pc.connectionState === 'connected' && config.directOnly) {
      void pc
        .getStats()
        .then((stats) => {
          stats.forEach((report) => {
            if (report.type === 'transport' && report.selectedCandidatePairId) {
              const pair = stats.get(report.selectedCandidatePairId);
              if (
                pair &&
                [
                  stats.get(pair.localCandidateId)?.candidateType,
                  stats.get(pair.remoteCandidateId)?.candidateType,
                ].includes('relay')
              )
                fail(
                  new Error(
                    'A relay connection was rejected in direct-only mode.',
                  ),
                );
            }
          });
        })
        .catch(fail);
    }
  };
  for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);
  const receive = async () => {
    if (closed) return;
    try {
      const response = (await request(
        `/rtc/signals?roundId=${options.roundId}&after=${cursor}`,
      )) as { cursor: number; messages: { id: number; payload: Signal }[] };
      for (const { payload: signal } of response.messages) {
        if (closed) return;
        if (signal.type === 'offer' && !config.initiator) {
          connectionId = signal.connectionId;
          await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          await pc.setLocalDescription(await pc.createAnswer());
          await send({
            type: 'answer',
            connectionId,
            sdp: pc.localDescription!.sdp,
          });
        } else if (
          signal.type === 'answer' &&
          config.initiator &&
          signal.connectionId === connectionId
        ) {
          await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        } else if (signal.type === 'ice') {
          if (signal.connectionId === connectionId && pc.remoteDescription)
            await pc.addIceCandidate(signal.candidate);
          else
            waiting.set(signal.connectionId, [
              ...(waiting.get(signal.connectionId) ?? []),
              signal.candidate,
            ]);
        }
        if (connectionId && pc.remoteDescription) {
          for (const candidate of waiting.get(connectionId) ?? [])
            await pc.addIceCandidate(candidate);
          waiting.delete(connectionId);
        }
      }
      cursor = response.cursor;
      if (!closed)
        poll = setTimeout(
          () => void receive(),
          pc.connectionState === 'connected' ? 1000 : 250,
        );
    } catch (error) {
      if (!closed) fail(error);
    }
  };
  try {
    end = setTimeout(
      close,
      Math.max(
        0,
        config.roundEndsAt -
          config.serverTime -
          (performance.now() - requestedAt),
      ),
    );
    if (config.initiator) {
      await pc.setLocalDescription(await pc.createOffer());
      await send({
        type: 'offer',
        connectionId: connectionId!,
        sdp: pc.localDescription!.sdp,
      });
    }
    void receive();
    if (options.transcribe) {
      speech = new WebSocket(
        root.replace(/^http/, 'ws') +
          `/transcription?roundId=${options.roundId}`,
      );
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Transcription handshake timed out.')),
          12_000,
        );
        speech!.onmessage = (event) => {
          const data = JSON.parse(String(event.data));
          if (data.type === 'transcription.ready') {
            clearTimeout(timeout);
            resolve();
          }
          options.onTranscript?.(data);
        };
        speech!.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Transcription connection failed.'));
        };
        speech!.onclose = () => {
          clearTimeout(timeout);
          if (!closed) {
            reject(new Error('Transcription disconnected.'));
            fail(new Error('Transcription disconnected; rejoin the call.'));
          }
        };
      });
      if (closed) return { close, peerConnection: pc };
      context = new AudioContext({ sampleRate: 16000 });
      if (context.sampleRate !== 16000)
        throw new Error('This browser cannot capture 16000 Hz audio.');
      const workletSource = `class PCM extends AudioWorkletProcessor {
        constructor() { super(); this.pcm = new Int16Array(1600); this.at = 0; }
        process(inputs) {
          const samples = inputs[0]?.[0];
          if (samples) for (const sample of samples) {
            const clipped = Math.max(-1, Math.min(1, sample));
            this.pcm[this.at++] = clipped < 0 ? clipped * 32768 : clipped * 32767;
            if (this.at === 1600) { this.port.postMessage(this.pcm.buffer, [this.pcm.buffer]); this.pcm = new Int16Array(1600); this.at = 0; }
          }
          return true;
        }
      } registerProcessor('rolecall-pcm', PCM);`;
      const blobUrl = URL.createObjectURL(
        new Blob([workletSource], { type: 'text/javascript' }),
      );
      try {
        await context.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      const node = new AudioWorkletNode(context, 'rolecall-pcm');
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (speech?.readyState === WebSocket.OPEN && !closed) {
          if (speech.bufferedAmount > 64_000) {
            fail(new Error('Transcription upload is too slow.'));
            return;
          }
          speech.send(event.data);
        }
      };
      context.createMediaStreamSource(mic).connect(node);
      const muted = context.createGain();
      muted.gain.value = 0;
      node.connect(muted).connect(context.destination);
      await context.resume();
    }
    return { close, peerConnection: pc };
  } catch (error) {
    close();
    throw error;
  }
}
