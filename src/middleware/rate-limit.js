const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const fallbackBuckets = new Map();

const fallbackCheck = (key, windowMs) => {
  const now = Date.now();
  const current = fallbackBuckets.get(key);
  if (!current || current.resetAt <= now) {
    const value = { count: 1, resetAt: now + windowMs };
    fallbackBuckets.set(key, value);
    return value;
  }
  current.count += 1;
  return current;
};

const defaultKey = (req, scope) => {
  const raw = `${scope}:${req.ip}:${req.user?.googleId || 'guest'}`;
  return `${scope}:${crypto.createHash('sha256').update(raw).digest('hex')}`;
};

const incrementDatabaseBucket = async (key, windowMs) => {
  const [row] = await sequelize.query(
    `
      INSERT INTO "ApiRateLimits" ("key", "count", "resetAt", "createdAt", "updatedAt")
      VALUES (:key, 1, NOW() + (:windowMs * INTERVAL '1 millisecond'), NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "ApiRateLimits"."resetAt" <= NOW() THEN 1
          ELSE "ApiRateLimits"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "ApiRateLimits"."resetAt" <= NOW() THEN NOW() + (:windowMs * INTERVAL '1 millisecond')
          ELSE "ApiRateLimits"."resetAt"
        END,
        "updatedAt" = NOW()
      RETURNING "count", "resetAt";
    `,
    { replacements: { key, windowMs }, type: QueryTypes.SELECT }
  );
  return { count: Number(row.count), resetAt: new Date(row.resetAt).getTime() };
};

const createRateLimit = ({ windowMs, max, message, scope = 'api', keyGenerator }) =>
  async (req, res, next) => {
    const key = String(keyGenerator ? keyGenerator(req) : defaultKey(req, scope)).slice(0, 255);
    let bucket;
    try {
      bucket = await incrementDatabaseBucket(key, windowMs);
    } catch (error) {
      // Permite levantar la API antes de migrar, pero conserva un límite local de respaldo.
      console.error('Rate limit PostgreSQL no disponible; se usa respaldo en memoria:', error.message);
      bucket = fallbackCheck(key, windowMs);
    }

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

    if (bucket.count <= max) return next();
    res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ message });
  };

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of fallbackBuckets.entries()) {
    if (value.resetAt <= now) fallbackBuckets.delete(key);
  }
  sequelize
    .query('DELETE FROM "ApiRateLimits" WHERE "resetAt" < NOW() - INTERVAL \'1 day\';')
    .catch(() => {});
}, 60 * 60_000).unref();

module.exports = { createRateLimit };
