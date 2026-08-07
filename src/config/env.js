const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const splitCsv = (value = '') =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const projectRoot = path.resolve(__dirname, '../..');
const nodeEnv = process.env.NODE_ENV || 'development';
const configuredAdminEmails = splitCsv(
  process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL
).map((email) => email.toLowerCase());

const env = Object.freeze({
  projectRoot,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: toInteger(process.env.PORT, 5001),
  countryCode: String(process.env.SITE_COUNTRY_CODE || 'PE').trim().toUpperCase(),
  countryName: String(process.env.SITE_COUNTRY_NAME || 'Perú').trim(),

  databaseUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: toInteger(process.env.DB_PORT, 5432),
  dbName: process.env.DB_NAME || '',
  dbUser: process.env.DB_USER || '',
  dbPassword: process.env.DB_PASSWORD || '',
  dbSsl: toBoolean(process.env.DB_SSL, false),
  dbLogging: toBoolean(process.env.DB_LOGGING, false),
  dbPoolMax: toInteger(process.env.DB_POOL_MAX, 10),
  dbPoolMin: toInteger(process.env.DB_POOL_MIN, 0),
  dbPoolIdleMs: toInteger(process.env.DB_POOL_IDLE_MS, 10000),
  dbPoolAcquireMs: toInteger(process.env.DB_POOL_ACQUIRE_MS, 30000),
  // Activo por defecto: una instalación nueva prepara su esquema al arrancar.
  dbAutoMigrate: toBoolean(process.env.DB_AUTO_MIGRATE, true),

  sessionSecret:
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    'development-only-change-me',
  sessionDays: toInteger(process.env.SESSION_DAYS, 7),
  cookieName: process.env.COOKIE_NAME || 'maze.sid',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSameSite: String(
    process.env.COOKIE_SAME_SITE || (nodeEnv === 'production' ? 'lax' : 'lax')
  ).toLowerCase(),

  frontendUrl:
    process.env.FRONTEND_URL ||
    (nodeEnv === 'production' ? 'https://mazetour.com' : 'http://localhost:5173'),
  corsOrigins: splitCsv(process.env.CORS_ORIGIN),
  frameAncestors: splitCsv(process.env.FRAME_ANCESTORS),
  adminEmails: [...new Set(configuredAdminEmails)],

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  chatDailyLimit: toInteger(process.env.CHAT_DAILY_LIMIT, 500),
  chatTimeoutMs: toInteger(process.env.CHAT_TIMEOUT_MS, 15000),

  maxUploadTotalBytes: toInteger(process.env.MAX_UPLOAD_TOTAL_MB, 80) * 1024 * 1024,
  maxImageBytes: toInteger(process.env.MAX_IMAGE_MB, 6) * 1024 * 1024,
  maxPdfBytes: toInteger(process.env.MAX_PDF_MB, 12) * 1024 * 1024,
  imageMaxWidth: toInteger(process.env.IMAGE_MAX_WIDTH, 2200),
  imageMaxHeight: toInteger(process.env.IMAGE_MAX_HEIGHT, 2200),
  imageWebpQuality: toInteger(process.env.IMAGE_WEBP_QUALITY, 82),

  uploadRoot: path.join(projectRoot, 'storage', 'uploads'),
  upload2Root: path.join(projectRoot, 'storage', 'uploads2'),
  legacyUploadRoots: [
    path.join(projectRoot, 'uploads'),
    path.join(path.dirname(projectRoot), 'uploads'),
    ...splitCsv(process.env.LEGACY_UPLOAD_ROOTS).map((value) => path.resolve(projectRoot, value)),
  ],
  legacyUpload2Roots: [
    path.join(projectRoot, 'uploads2'),
    path.join(path.dirname(projectRoot), 'uploads2'),
    ...splitCsv(process.env.LEGACY_UPLOAD2_ROOTS).map((value) => path.resolve(projectRoot, value)),
  ],
});

const databaseIsConfigured =
  Boolean(env.databaseUrl) || Boolean(env.dbName && env.dbUser && env.dbHost);

if (!databaseIsConfigured) {
  throw new Error(
    'Base de datos no configurada. Define DATABASE_URL o DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD.'
  );
}

if (env.isProduction && env.sessionSecret === 'development-only-change-me') {
  throw new Error('SESSION_SECRET es obligatorio en producción.');
}

if (!['lax', 'strict', 'none'].includes(env.cookieSameSite)) {
  throw new Error('COOKIE_SAME_SITE debe ser lax, strict o none.');
}

if (env.cookieSameSite === 'none' && !env.isProduction) {
  console.warn('COOKIE_SAME_SITE=none requiere HTTPS para que el navegador acepte la cookie.');
}

module.exports = { env, splitCsv, toBoolean, toInteger };
