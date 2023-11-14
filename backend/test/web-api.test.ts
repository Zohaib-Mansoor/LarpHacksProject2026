import { afterEach, expect, it, vi } from 'vitest';
import { ensureSession, persistProfile } from '../../web/src/lib/api.js';

afterEach(() => vi.unstubAllGlobals());

it('rechecks the session after an earlier successful connection expires', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ authenticated: true }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({}));
  vi.stubGlobal('fetch', fetch);
  await ensureSession();
  await ensureSession();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/me',
    '/api/me',
    '/api/auth/sign-in/anonymous',
  ]);
});

it('preserves server preferences when saving only a callsign', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
    Response.json(
      url === '/api/me'
        ? {}
        : {
            displayName: 'Saved caller',
            leaderboardOptIn: true,
            theme: 'dark',
            captions: true,
            reducedMotion: false,
            guest: false,
          },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const profile = await persistProfile({ callsign: 'New caller' });
  const patch = fetch.mock.calls.find(
    ([url, init]) => url === '/api/me/settings' && init?.method === 'PATCH',
  );
  expect(patch).toBeDefined();
  expect(JSON.parse(patch![1]!.body as string)).toMatchObject({
    displayName: 'New caller',
    leaderboardOptIn: true,
    theme: 'dark',
  });
  expect(profile.leaderboardOptIn).toBe(true);
});
