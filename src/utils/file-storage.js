const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { env } = require('../config/env');

const normalizeSlash = (value) => String(value).replace(/\\/g, '/');
const isRemoteUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const storedPathForFile = (file) => {
  if (!file?.path) return null;
  const relative = normalizeSlash(path.relative(env.uploadRoot, file.path));
  if (relative.startsWith('..')) return null;
  return `uploads/${relative}`;
};

const safePathInside = (root, relative) => {
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }
  return absolute;
};

const resolveStoredPath = (storedPath) => {
  if (!storedPath || typeof storedPath !== 'string' || isRemoteUrl(storedPath)) {
    return null;
  }

  const normalized = normalizeSlash(storedPath).replace(/^\/+/, '');
  let relative;
  let roots;

  if (normalized.startsWith('uploads2/')) {
    relative = normalized.slice('uploads2/'.length);
    roots = [env.upload2Root, ...env.legacyUpload2Roots];
  } else if (normalized.startsWith('uploads/')) {
    relative = normalized.slice('uploads/'.length);
    roots = [env.uploadRoot, ...env.legacyUploadRoots];
  } else {
    return null;
  }

  const candidates = [...new Set(roots.map((root) => path.resolve(root)))]
    .map((root) => safePathInside(root, relative))
    .filter(Boolean);

  return candidates.find((candidate) => fsSync.existsSync(candidate)) || candidates[0] || null;
};

const deleteStoredFiles = async (paths) => {
  const uniquePaths = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
  await Promise.all(
    uniquePaths.map(async (storedPath) => {
      const absolute = resolveStoredPath(storedPath);
      if (!absolute) return;
      try {
        await fs.unlink(absolute);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`No se pudo eliminar ${storedPath}:`, error.message);
        }
      }
    })
  );
};

const uploadedPathsFromRequest = (req) =>
  Object.values(req.files || {})
    .flat()
    .map(storedPathForFile)
    .filter(Boolean);

const pathsFromPlace = (place) => {
  if (!place) return [];
  const paths = [];
  if (place.imageUrl) paths.push(place.imageUrl);
  if (Array.isArray(place.gallery)) paths.push(...place.gallery);

  for (const hotel of place.hotels || []) {
    if (Array.isArray(hotel.images)) paths.push(...hotel.images);
    for (const room of hotel.rooms || []) {
      if (Array.isArray(room.images)) paths.push(...room.images);
    }
  }

  for (const restaurant of place.restaurants || []) {
    if (Array.isArray(restaurant.images)) paths.push(...restaurant.images);
    if (restaurant.menuPdf) paths.push(restaurant.menuPdf);
    for (const item of restaurant.menuItems || []) {
      if (item.dishImage) paths.push(item.dishImage);
    }
  }

  return paths.filter(Boolean);
};

module.exports = {
  deleteStoredFiles,
  isRemoteUrl,
  pathsFromPlace,
  resolveStoredPath,
  storedPathForFile,
  uploadedPathsFromRequest,
};
