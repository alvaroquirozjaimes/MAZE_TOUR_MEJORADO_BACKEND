const { env } = require('../config/env');

const securityHeaders = (_req, res, next) => {
  const frameAncestors = env.frameAncestors.length
    ? env.frameAncestors
    : ["'self'", 'https://mazetour.com', 'https://www.mazetour.com'];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors.join(' ')}`);
  if (env.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

module.exports = { securityHeaders };
