const { listMapCatalog, updateMapItem } = require('../services/map-catalog.service');

const publicCatalog = async (req, res) =>
  res.status(200).json(await listMapCatalog(req.query, { admin: false }));

const adminCatalog = async (req, res) =>
  res.status(200).json(await listMapCatalog(req.query, { admin: true }));

const updateItem = async (req, res) =>
  res.status(200).json({
    message: 'Ubicación del mapa actualizada correctamente.',
    item: await updateMapItem(req.params.entityType, req.params.id, req.body, req),
  });

module.exports = { adminCatalog, publicCatalog, updateItem };
