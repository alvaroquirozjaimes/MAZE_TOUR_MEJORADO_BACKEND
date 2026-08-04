const { createApp } = require('./app');
const { env } = require('./config/env');
const { connectDatabase, sequelize } = require('./config/database');
const { assertMigrationsApplied } = require('./database/migration-status');

let server;
let shuttingDown = false;

const start = async () => {
  await connectDatabase();
  await assertMigrationsApplied();
  const app = createApp();
  server = app.listen(env.port, () => {
    console.log(`MAZE TOUR API activa en el puerto ${env.port} (${env.nodeEnv}).`);
  });
};

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recibido. Cerrando servidor...`);
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  } finally {
    process.exit(exitCode);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => {
  console.error('Promesa no controlada:', error);
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  console.error('Excepción no controlada:', error);
  shutdown('uncaughtException', 1);
});

start().catch((error) => {
  console.error('No se pudo iniciar la API:', error);
  process.exit(1);
});
