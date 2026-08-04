const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [path.resolve(__dirname, '../src'), path.resolve(__dirname, '..')];
const files = new Set();

const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'storage'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.add(absolute);
  }
};

for (const root of roots) visit(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
console.log(`Sintaxis válida en ${files.size} archivos JavaScript.`);
