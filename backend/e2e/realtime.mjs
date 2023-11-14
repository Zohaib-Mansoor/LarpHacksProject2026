/* global console, process, window, RTCPeerConnection, URL, AudioNode, AudioBufferSourceNode, Event */
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
const origin = process.env.E2E_ORIGIN ?? 'http://127.0.0.1:4173';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const a = await browser.newContext({ permissions: ['microphone'] }),
  b = await browser.newContext({ permissions: ['microphone'] });
for (const context of [a, b])
  await context.addInitScript(() => {
    window.__voiceTestPeers = [];
    window.__relayPlaybackPaths = [];
    const edges = new WeakMap();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = connect.call(this, destination, ...args);
      edges.set(this, [...(edges.get(this) ?? []), destination]);
      return result;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const reachesOutput = (node, seen = new Set()) => {
        if (node === this.context.destination) return true;
        if (seen.has(node)) return false;
        seen.add(node);
        return (edges.get(node) ?? []).some((next) =>
          reachesOutput(next, seen),
        );
      };
      window.__relayPlaybackPaths.push(reachesOutput(this));
      return start.apply(this, args);
    };
    const Original = RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(config) {
        super(config);
        window.__voiceTestPeers.push(this);
      }
    };
  });
const one = await a.newPage(),
  two = await b.newPage();
const errors = [];
for (const page of [one, two]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', async (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/api/me'))
      console.log(
        'HTTP failure',
        r.status(),
        r.url(),
        (await r.text()).slice(0, 200),
      );
  });
}
try {
  await expect
    .poll(
      async () => {
        try {
          return (await a.request.get(`${origin}/ready`)).status();
        } catch {
          return 0;
        }
      },
      { timeout: 10000 },
    )
    .toBe(200);
  await one.goto(`${origin}/setup?mode=create`);
  await one.getByRole('checkbox').check();
  await one
    .getByRole('button', { name: 'Continue to brief', exact: true })
    .click();
  await one.waitForURL('**/room/*');
  const code = new URL(one.url()).pathname.split('/').at(-1);
  await two.goto(`${origin}/setup?mode=join`);
  await two.getByLabel('6-character room code').fill(code);
  await two.getByRole('checkbox').check();
  await two.getByRole('button', { name: 'Join room', exact: true }).click();
  await two.waitForURL('**/room/*');
  await one
    .getByRole('button', { name: '🎙️ Hop on live VC →', exact: true })
    .click();
  await two
    .getByRole('button', { name: '🎙️ Hop on live VC →', exact: true })
    .click();
  await one.getByRole('toolbar', { name: 'Voice chat controls' }).waitFor();
  await two.getByRole('toolbar', { name: 'Voice chat controls' }).waitFor();
  await expect
    .poll(
      async () =>
        one.evaluate(() =>
          window.__voiceTestPeers.some(
            (pc) => pc.connectionState === 'connected',
          ),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        two.evaluate(() =>
          window.__voiceTestPeers.some(
            (pc) => pc.connectionState === 'connected',
          ),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  for (const page of [one, two])
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            let received = 0;
            for (const pc of window.__voiceTestPeers) {
              const stats = await pc.getStats();
              stats.forEach((stat) => {
                if (stat.type === 'inbound-rtp' && stat.kind === 'audio')
                  received += stat.bytesReceived ?? 0;
              });
            }
            return received;
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
  console.log(
    'PASS: both browsers receive actual WebRTC audio RTP using synthetic microphones.',
  );
  const mic = one.getByRole('button', { name: 'Mic On', exact: true });
  await mic.click();
  await expect(
    one.getByRole('button', { name: 'Unmute (M)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await one.evaluate(() =>
      window.__voiceTestPeers
        .filter((pc) => pc.connectionState === 'connected')
        .every((pc) =>
          pc
            .getSenders()
            .filter((s) => s.track?.kind === 'audio')
            .every((s) => !s.track.enabled),
        ),
    ),
  ).toBe(true);
  await one.getByRole('button', { name: 'Unmute (M)', exact: true }).click();
  console.log(
    'PASS: mute disables the real sender track and unmute restores it.',
  );
  await expect(two.getByTestId('speaking-turn')).toContainText('Alex');
  await expect(one.getByTestId('speaking-turn')).toContainText('Wrap up', {
    timeout: 45000,
  });
  await expect(two.getByTestId('speaking-turn')).toContainText('Your turn', {
    timeout: 15000,
  });
  for (const [page, enabled] of [
    [one, false],
    [two, true],
  ]) {
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__voiceTestPeers
              .filter((pc) => pc.connectionState === 'connected')
              .flatMap((pc) => pc.getSenders())
              .filter((s) => s.track?.kind === 'audio')
              .every((s) => s.track.enabled),
          ),
        { timeout: 5000 },
      )
      .toBe(enabled);
  }
  console.log(
    'PASS: 10-second warning, 45-second turn switch, real microphone auto-mute and next speaker enabled.',
  );

  // Force a P2P disconnect after ontrack has installed the RTC meter. Relay
  // playback must still reach the output through its own analyser and mute gain.
  for (const page of [one, two]) {
    await page.evaluate(() => {
      window.__relayPlaybackPaths = [];
      for (const pc of window.__voiceTestPeers) {
        pc.close();
        Object.defineProperty(pc, 'connectionState', { value: 'disconnected' });
        pc.onconnectionstatechange?.(new Event('connectionstatechange'));
      }
    });
  }
  await expect
    .poll(() => one.evaluate(() => window.__relayPlaybackPaths.length), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);
  expect(
    await one.evaluate(() => window.__relayPlaybackPaths.every(Boolean)),
  ).toBe(true);
  console.log(
    'PASS: PCM fallback after P2P disconnect remains connected to the audio output.',
  );

  await one.getByRole('button', { name: 'Propose terms', exact: true }).click();
  await one
    .getByRole('button', { name: 'Table $5.50M proposal', exact: true })
    .click();
  await two
    .getByRole('button', { name: 'Sign rev #1 ✓', exact: true })
    .waitFor();
  await one.getByRole('button', { name: 'Sign rev #1 ✓', exact: true }).click();
  await expect(two.locator('.sig-pill.is-partner')).toContainText('Signed');
  await two.getByRole('button', { name: 'Revise terms', exact: true }).click();
  await two.getByRole('button', { name: '$5.25M', exact: true }).click();
  await two
    .getByRole('button', { name: 'Table $5.25M proposal', exact: true })
    .click();
  await one
    .getByRole('button', { name: 'Sign rev #2 ✓', exact: true })
    .waitFor();
  await expect(one.locator('.sig-pill').first()).toContainText('Unsigned');
  await one.getByRole('button', { name: 'Sign rev #2 ✓', exact: true }).click();
  await expect(two.locator('.sig-pill.is-partner')).toContainText('Signed');
  await two.getByRole('button', { name: 'Sign rev #2 ✓', exact: true }).click();
  await one.waitForURL('**/results/*');
  await two.waitForURL('**/results/*');
  await expect(
    one.getByRole('heading', { name: '$5.25M', exact: true }),
  ).toBeVisible();
  await one.route(
    '**/api/vc/room?*',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Temporary result lookup failure.' },
        }),
      }),
    { times: 1 },
  );
  await one.reload();
  await expect(
    one.getByRole('heading', { name: '$5.25M', exact: true }),
  ).toBeVisible();
  console.log(
    'PASS: SSE updates, proposal revision reset, two signatures, persisted results, reload, and recovery from a failed lookup.',
  );

  await one.goto(`${origin}/account`);
  await one.getByLabel('Public standings callsign').fill('VOICE-BROWSER-QA');
  await one
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect(one.getByText('Caller preferences saved.')).toBeVisible();
  await one.reload();
  await expect(one.getByLabel('Public standings callsign')).toHaveValue(
    'VOICE-BROWSER-QA',
  );
  console.log(
    'PASS: React preferences are saved in PostgreSQL and restored after reload.',
  );
  expect(errors).toEqual([]);
  console.log('PASS: no browser JavaScript errors.');
} catch (error) {
  for (const page of [one, two]) {
    const details = await page.evaluate(async () => {
      const result = [];
      for (const pc of window.__voiceTestPeers)
        result.push({
          state: pc.connectionState,
          senders: pc.getSenders().map((s) => ({
            kind: s.track?.kind,
            enabled: s.track?.enabled,
            state: s.track?.readyState,
          })),
          transceivers: pc.getTransceivers().map((t) => ({
            direction: t.direction,
            current: t.currentDirection,
          })),
          stats: [...(await pc.getStats()).values()].filter((s) =>
            ['inbound-rtp', 'outbound-rtp'].includes(s.type),
          ),
        });
      return result;
    });
    console.log('RTC diagnostics:', JSON.stringify(details));
  }
  console.log(
    'Browser one:',
    (await one.locator('body').innerText()).slice(-2200),
  );
  console.log(
    'Browser two:',
    (await two.locator('body').innerText()).slice(-1200),
  );
  throw error;
} finally {
  await browser.close();
}
