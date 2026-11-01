import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './db/client.js';
import { buildDemoApp } from './demo-app.js';

const config = loadConfig();
const connection = connectDatabase(config.databaseUrl);
const { app } = config.demoMode
  ? await buildDemoApp({ db: connection.db, config })
  : await buildApp({ db: connection.db, config });
app.addHook('onClose', connection.close);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch((err: unknown) => {
      app.log.error(err);
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  await app.close();
  process.exitCode = 1;
}
