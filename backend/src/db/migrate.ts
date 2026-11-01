import { migrate } from 'drizzle-orm/node-postgres/migrator';
import 'dotenv/config';
import { connectDatabase } from './client.js';

if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before migrating.');
const connection = connectDatabase(process.env.DATABASE_URL);
try {
  await migrate(connection.db, { migrationsFolder: 'drizzle' });
  console.log('Database migrations applied.');
} finally {
  await connection.close();
}
