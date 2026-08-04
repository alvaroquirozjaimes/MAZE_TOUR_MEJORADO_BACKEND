const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { env } = require('../src/config/env');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(env.projectRoot, 'storage', 'backups', timestamp);
fs.mkdirSync(backupDir, { recursive: true });

const databaseFile = path.join(backupDir, 'maze-tour-postgresql.dump');
const uploadsFile = path.join(backupDir, 'maze-tour-media.tar.gz');
const pgArgs = env.databaseUrl
  ? ['--format=custom', '--file', databaseFile, env.databaseUrl]
  : [
      '--format=custom', '--file', databaseFile,
      '--host', env.dbHost, '--port', String(env.dbPort),
      '--username', env.dbUser, env.dbName,
    ];

const pgResult = spawnSync('pg_dump', pgArgs, {
  stdio: 'inherit',
  env: { ...process.env, PGPASSWORD: env.dbPassword },
});
if (pgResult.error || pgResult.status !== 0) {
  console.error('No se pudo ejecutar pg_dump. Instala postgresql-client y vuelve a intentarlo.');
  process.exit(1);
}

const storageRoot = path.dirname(env.uploadRoot);
for (const directory of [env.uploadRoot, env.upload2Root]) fs.mkdirSync(directory, { recursive: true });
const tarResult = spawnSync(
  'tar',
  ['-czf', uploadsFile, '-C', storageRoot, path.basename(env.uploadRoot), path.basename(env.upload2Root)],
  { stdio: 'inherit' }
);
if (tarResult.error || tarResult.status !== 0) {
  console.error('La base fue respaldada, pero no se pudo comprimir storage/uploads y storage/uploads2.');
  process.exit(1);
}

console.log(`Respaldo creado en: ${backupDir}`);
