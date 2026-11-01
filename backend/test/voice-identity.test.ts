import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import type { Database } from '../src/db/client.js';
import { VoiceStore } from '../src/voice-store.js';

it('uses persisted account usernames for both room participants and refreshes renamed profiles', async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: 'drizzle' });
    await db.insert(schema.user).values([
      {
        id: 'identity-one',
        name: 'Account One',
        email: 'one@identity.test',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'identity-two',
        name: 'Account Two',
        email: 'two@identity.test',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await db.insert(schema.userSettings).values([
      { userId: 'identity-one', displayName: 'FirstNegotiator' },
      { userId: 'identity-two', displayName: 'SecondNegotiator' },
    ]);
    const store = new VoiceStore(db as unknown as Database);
    const room = await store.create('identity-one');
    await store.join('identity-two', room.code);
    const first = await store.read('identity-one', room.code);
    expect(first.you).toMatchObject({
      name: 'FirstNegotiator',
      short: 'FirstNegotiator',
    });
    expect(first.peer).toMatchObject({ name: 'SecondNegotiator' });
    const second = await store.read('identity-two', room.code);
    expect(second.you).toMatchObject({ name: 'SecondNegotiator' });
    expect(second.peer).toMatchObject({ name: 'FirstNegotiator' });
    await db
      .update(schema.userSettings)
      .set({ displayName: 'RenamedNegotiator' })
      .where(eq(schema.userSettings.userId, 'identity-two'));
    expect((await store.read('identity-one', room.code)).peer).toMatchObject({
      name: 'RenamedNegotiator',
    });
  } finally {
    await pg.close();
  }
}, 30000);
