// Browser consumers must use `import type`; never import game code at runtime.
export type { RoomSnapshot, Terms } from '../src/game.js';
export type AccountSettings = {
  displayName: string;
  theme: 'system' | 'light' | 'dark';
  captions: boolean;
  reducedMotion: boolean;
  guest: boolean;
};
export type TextMessage = {
  id: number;
  seat: number;
  text: string;
  createdAt: string;
};
export type CreateRoomResponse = {
  room: import('../src/game.js').RoomSnapshot;
  inviteToken: string;
};
