const { env } = require('../config/env');
const { isAdminUser } = require('../config/access');

const currentUser = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.isAuthenticated?.() || !req.user) return res.status(401).json(null);
  const user = req.user.toJSON ? req.user.toJSON() : req.user;
  return res.status(200).json({
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role || 'user',
    lastLoginAt: user.lastLoginAt || null,
    loginCount: Number(user.loginCount || 0),
    isAdmin: isAdminUser(user),
  });
};

const logout = (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) return next(logoutError);
    return req.session.destroy((sessionError) => {
      if (sessionError) return next(sessionError);
      res.clearCookie(env.cookieName, {
        path: '/',
        httpOnly: true,
        secure: env.isProduction,
        sameSite: env.cookieSameSite,
        domain: env.cookieDomain,
      });
      return res.status(200).json({ message: 'Sesión cerrada correctamente.' });
    });
  });
};

module.exports = { currentUser, logout };
