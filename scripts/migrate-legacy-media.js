const fs = require('fs/promises');
const path = require('path');
const { env } = require('../src/config/env');

const copyTree = async (sourceRoot, targetRoot, stats) => {
  let entries;
  try {
    entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  await fs.mkdir(targetRoot, { recursive: true });

  for (const entry of entries) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      await copyTree(source, target, stats);
      continue;
    }
    if (!entry.isFile() || entry.name === '.gitkeep') continue;

    try {
      await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
      stats.copied += 1;
    } catch (error) {
      if (error.code === 'EEXIST') stats.existing += 1;
      else throw error;
    }
  }
};

const migrateGroup = async (sources, target) => {
  const stats = { copied: 0, existing: 0 };
  const targetResolved = path.resolve(target);

  for (const source of [...new Set(sources.map((value) => path.resolve(value)))]) {
    if (source === targetResolved) continue;
    await copyTree(source, targetResolved, stats);
  }

  return stats;
};

const main = async () => {
  const uploads = await migrateGroup(env.legacyUploadRoots, env.uploadRoot);
  const uploads2 = await migrateGroup(env.legacyUpload2Roots, env.upload2Root);

  console.log('Migración de archivos finalizada.');
  console.log(`uploads: ${uploads.copied} copiados, ${uploads.existing} ya existentes.`);
  console.log(`uploads2: ${uploads2.copied} copiados, ${uploads2.existing} ya existentes.`);
};

main().catch((error) => {
  console.error('No se pudieron migrar los archivos antiguos:', error);
  process.exitCode = 1;
});
