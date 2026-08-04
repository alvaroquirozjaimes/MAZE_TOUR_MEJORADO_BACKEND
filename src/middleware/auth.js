const { AppError } = require('../utils/app-error');
const { isAdminUser } = require('../config/access');

const requireAuth = (req, _res, next) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return next(new AppError('Debes iniciar sesión para realizar esta acción.', 401));
};

const requireAdmin = (req, _res, next) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return next(new AppError('Debes iniciar sesión para realizar esta acción.', 401));
  }

  if (!isAdminUser(req.user)) {
    return next(new AppError('No tienes permisos para realizar esta acción.', 403));
  }

  return next();
};

module.exports = { requireAdmin, requireAuth };
