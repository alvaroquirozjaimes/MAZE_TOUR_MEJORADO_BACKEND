const multer = require('multer');
const {
  ForeignKeyConstraintError,
  OptimisticLockError,
  UniqueConstraintError,
  ValidationError,
} = require('sequelize');
const { env } = require('../config/env');

const notFound = (req, res) =>
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`, requestId: req.requestId });

const errorHandler = (error, req, res, _next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Error interno del servidor.';
  let details = error.details;

  if (error instanceof multer.MulterError) {
    statusCode = 400;
    message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Uno de los archivos supera el límite permitido.'
      : `Error al subir archivos: ${error.message}`;
  } else if (error instanceof ValidationError) {
    statusCode = 400;
    message = 'Los datos enviados no son válidos.';
    details = error.errors.map((item) => ({ field: item.path, message: item.message }));
  } else if (error instanceof OptimisticLockError) {
    statusCode = 409;
    message = 'El registro fue modificado por otra operación. Recarga la información e inténtalo nuevamente.';
  } else if (error instanceof UniqueConstraintError) {
    statusCode = 409;
    message = 'El registro ya existe.';
  } else if (error instanceof ForeignKeyConstraintError) {
    statusCode = 409;
    message = 'No se puede completar la operación porque existen registros relacionados.';
  }

  if (statusCode >= 500) {
    console.error(`[${req.requestId || 'sin-id'}] Error no controlado:`, error);
    if (env.isProduction) message = 'Error interno del servidor.';
  }

  const payload = { message, requestId: req.requestId };
  if (details) payload.details = details;
  if (!env.isProduction && statusCode >= 500) payload.stack = error.stack;
  return res.status(statusCode).json(payload);
};

module.exports = { errorHandler, notFound };
