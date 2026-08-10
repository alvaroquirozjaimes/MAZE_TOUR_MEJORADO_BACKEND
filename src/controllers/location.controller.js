const { ensureId, toBoolean } = require('../utils/parsers');
const { deleteStoredFiles, storedPathForFile } = require('../utils/file-storage');
const {
  createDestination,
  createRegion,
  deleteDestination,
  deleteRegion,
  getAdminCatalog,
  listCatalog,
  updateDestination,
  updateRegion,
} = require('../services/location.service');

/* onlyWithContent: el selector público solo ofrece ubicaciones donde
   hay algo que ver. El panel usa getAdminCatalog y sigue viendo todo. */
const catalog = async (_req, res) =>
  res.status(200).json(await listCatalog({ onlyWithContent: true }));
const adminCatalog = async (_req, res) => res.status(200).json(await getAdminCatalog());

const uploadedPath = (req, field) => storedPathForFile(req.files?.[field]?.[0]);
const visualBody = (req, field) => {
  const imageUrl = uploadedPath(req, field);
  return {
    ...req.body,
    ...(imageUrl ? { imageUrl } : {}),
    removeImage: req.body.removeImage === undefined
      ? undefined
      : toBoolean(req.body.removeImage, false),
  };
};

const runWithUploadCleanup = async (req, field, action) => {
  const imageUrl = uploadedPath(req, field);
  try {
    return await action(visualBody(req, field));
  } catch (error) {
    if (imageUrl) await deleteStoredFiles(imageUrl);
    throw error;
  }
};

const addRegion = async (req, res) => res.status(201).json(
  await runWithUploadCleanup(req, 'regionImage', (body) => createRegion(body, req))
);

const editRegion = async (req, res) => res.status(200).json(
  await runWithUploadCleanup(req, 'regionImage', (body) => updateRegion(ensureId(req.params.id), {
    ...body,
    isActive: body.isActive === undefined ? undefined : toBoolean(body.isActive, true),
  }, req))
);

const removeRegion = async (req, res) => {
  await deleteRegion(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Ubicación eliminada correctamente.' });
};

const addDestination = async (req, res) => res.status(201).json(
  await runWithUploadCleanup(req, 'destinationImage', (body) => createDestination(body, req))
);

const editDestination = async (req, res) => res.status(200).json(
  await runWithUploadCleanup(req, 'destinationImage', (body) => updateDestination(ensureId(req.params.id), {
    ...body,
    isActive: body.isActive === undefined ? undefined : toBoolean(body.isActive, true),
  }, req))
);

const removeDestination = async (req, res) => {
  await deleteDestination(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Destino eliminado correctamente.' });
};

module.exports = {
  addDestination,
  addRegion,
  adminCatalog,
  catalog,
  editDestination,
  editRegion,
  removeDestination,
  removeRegion,
};
