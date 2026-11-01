import { createAi, type AiProvider } from './ai.js';
import { createGeminiAi } from './gemini.js';
import type { Config } from './config.js';

export function configuredAi(config: Config): AiProvider | undefined {
  if (!config.ai) return undefined;
  return config.ai.provider === 'gemini'
    ? createGeminiAi(config.ai.apiKey, config.ai.model)
    : createAi(config.ai.apiKey, config.ai.model);
}
