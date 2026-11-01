import { expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerVoice } from '../src/voice-routes.js';
import type { Database } from '../src/db/client.js';

it('serves public game configuration without private briefs and scores previews on the server', async () => {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) =>
    reply
      .status((error as { status?: number }).status ?? 500)
      .send({ error: 'Invalid request' }),
  );
  await registerVoice(app, {} as Database, async () => ({ id: 'test-user' }));
  try {
    const response = await app.inject('/api/vc/config');
    expect(response.statusCode).toBe(200);
    const config = response.json();
    expect(config.rules.turnSeconds).toBe(45);
    expect(config.scenario.roles).toHaveLength(2);
    expect(JSON.stringify(config)).not.toMatch(
      /objectives|background|reservationPrice/,
    );
    const preview = await app.inject({
      method: 'POST',
      url: '/api/vc/preview',
      payload: { deal: { price: 525, package: 'phased' }, confirmed: true },
    });
    expect(preview.json()).toEqual({
      scores: { alex: [20, 0, 20], morgan: [20, 0, 20] },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/vc/preview',
      payload: { deal: { price: 999, package: 'phased' }, confirmed: true },
    });
    expect(invalid.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});
