import 'dotenv/config';

export type Config = {
  demoMode?: boolean;
  production: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  authUrl: string;
  authSecret: string;
  origins: string[];
  google?: { clientId: string; clientSecret: string };
  livekit?: { url: string; apiKey: string; apiSecret: string };
  ai?: { provider?: 'gemini' | 'openai'; apiKey: string; model: string };
  elevenLabsApiKey?: string;
  rtc?: {
    stunUrls: string[];
    turnUrl?: string;
    turnSecret?: string;
    allowRelay: boolean;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string) => {
    if (!env[key]?.trim())
      throw new Error(
        `Missing ${key}. Copy .env.example to .env and configure it.`,
      );
    return env[key]!;
  };
  const authSecret = required('BETTER_AUTH_SECRET');
  if (authSecret.length < 32 || authSecret.startsWith('replace-'))
    throw new Error(
      'BETTER_AUTH_SECRET must be a random secret of at least 32 characters.',
    );
  const production = env.NODE_ENV === 'production';
  // Render supplies its public HTTPS URL at runtime, including generated suffixes.
  const authUrl =
    env.BETTER_AUTH_URL?.trim() ||
    env.RENDER_EXTERNAL_URL?.trim() ||
    required('BETTER_AUTH_URL');
  const origins = (
    env.CLIENT_ORIGINS?.trim() ||
    (env.RENDER_EXTERNAL_URL ? authUrl : required('CLIENT_ORIGINS'))
  )
    .split(',')
    .map((o) => o.trim());
  for (const origin of [...origins, authUrl]) {
    const url = new URL(origin);
    if (url.origin !== origin || (production && url.protocol !== 'https:'))
      throw new Error(
        'Auth URL and client origins must be exact origins (HTTPS in production).',
      );
  }
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT.');
  if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET)
    throw new Error('Set both Google credentials.');
  const media = [env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET];
  if (media.some(Boolean) && !media.every(Boolean))
    throw new Error('Set all three LiveKit variables.');
  if (!!env.TURN_URL !== !!env.TURN_SHARED_SECRET)
    throw new Error('Set both TURN_URL and TURN_SHARED_SECRET.');
  const aiProvider =
    env.AI_PROVIDER ?? (env.GEMINI_API_KEY ? 'gemini' : 'openai');
  if (!['gemini', 'openai'].includes(aiProvider))
    throw new Error('AI_PROVIDER must be gemini or openai.');
  return {
    demoMode: env.DEMO_MODE !== 'false',
    production,
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl: required('DATABASE_URL'),
    authUrl,
    authSecret,
    origins,
    ai:
      aiProvider === 'gemini'
        ? env.GEMINI_API_KEY
          ? {
              provider: 'gemini',
              apiKey: env.GEMINI_API_KEY,
              model: env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
            }
          : undefined
        : env.OPENAI_API_KEY
          ? {
              provider: 'openai',
              apiKey: env.OPENAI_API_KEY,
              model: env.OPENAI_MODEL ?? 'gpt-5-mini',
            }
          : undefined,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || undefined,
    rtc: {
      stunUrls: (env.RTC_STUN_URLS ?? 'stun:stun.l.google.com:19302')
        .split(',')
        .filter(Boolean),
      turnUrl: env.TURN_URL || undefined,
      turnSecret: env.TURN_SHARED_SECRET || undefined,
      allowRelay: env.RTC_ALLOW_RELAY === 'true',
    },
    google: env.GOOGLE_CLIENT_ID
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        }
      : undefined,
    livekit: env.LIVEKIT_URL
      ? {
          url: env.LIVEKIT_URL,
          apiKey: env.LIVEKIT_API_KEY!,
          apiSecret: env.LIVEKIT_API_SECRET!,
        }
      : undefined,
  };
}
