import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TALK_MS, TURN_MS, TURN_COUNT, WARNING_MS } from './voice-turns.js';
import { DEMO_LINES } from './voice-demo.js';
type Package = {
  id: string;
  name: string;
  detail: string;
  first: number;
  full: number;
};
const scenario = (await import(
  pathToFileURL(resolve(import.meta.dirname, '../../playcall/lib/scenario.mjs'))
    .href
)) as {
  scenarioVersion: string;
  packages: Package[];
  publicCharacter: (id: string) => {
    id: string;
    name: string;
    short: string;
    role: string;
    employer: string;
  };
  scoreDeal: (deal: unknown, confirmed: boolean) => Record<string, number[]>;
  validDeal: (deal: unknown) => boolean;
};
export const voiceCatalog = {
  scenario: {
    id: scenario.scenarioVersion,
    title: 'The Satellite Deal',
    roles: ['alex', 'morgan'].map((id) => {
      const character = scenario.publicCharacter(id);
      return { ...character, name: character.role, short: character.role };
    }),
  },
  rules: {
    prices: [450, 475, 500, 525, 550, 575, 600],
    defaultPrice: 525,
    defaultPackage: 'phased',
    missionMax: 60,
    objectivePoints: 20,
    briefSeconds: 45,
    talkSeconds: TALK_MS / 1000,
    signingSeconds: 45,
    turnSeconds: TURN_MS / 1000,
    turnCount: TURN_COUNT,
    warningSeconds: WARNING_MS / 1000,
  },
  packages: scenario.packages,
  demo: { lines: DEMO_LINES },
};
export const previewVoiceDeal = scenario.scoreDeal;
export const validVoiceDeal = scenario.validDeal;
