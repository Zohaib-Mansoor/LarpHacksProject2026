import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  DATABASE_URL: 'postgresql://localhost/test',
  RENDER_EXTERNAL_URL: 'https://playcall-example.onrender.com',
  HOST: '0.0.0.0',
  PORT: '10000',
};

describe('Render runtime configuration', () => {
  it('uses the actual Render HTTPS origin for auth and trusted clients', () => {
    const config = loadConfig(base);
    expect(config.authUrl).toBe(base.RENDER_EXTERNAL_URL);
    expect(config.origins).toEqual([base.RENDER_EXTERNAL_URL]);
    expect(config.port).toBe(10000);
    expect(config.production).toBe(true);
  });
  it('preserves explicit custom domain settings and rejects insecure production origins', () => {
    const custom = loadConfig({
      ...base,
      BETTER_AUTH_URL: 'https://play.example.com',
      CLIENT_ORIGINS: 'https://play.example.com',
    });
    expect(custom.authUrl).toBe('https://play.example.com');
    expect(custom.origins).toEqual(['https://play.example.com']);
    expect(() =>
      loadConfig({
        ...base,
        RENDER_EXTERNAL_URL: 'http://playcall-example.onrender.com',
      }),
    ).toThrow('HTTPS');
  });
});
