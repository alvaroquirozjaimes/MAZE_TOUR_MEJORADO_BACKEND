const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { env } = require('./env');
const { buildConnectionString } = require('./database');

const PgSession = connectPgSimple(session);

/* Con rolling activo, express-session llama a store.touch() en CADA petición:
   un UPDATE contra PostgreSQL antes incluso de que el controlador empiece.
   En un like eso es latencia de red pura que el usuario nota. La caducidad se
   sigue renovando, pero como mucho una vez por hora y por sesión. */
const TOUCH_CADA_MS = 60 * 60 * 1000;

const createThrottledStore = () => {
  const store = new PgSession({
    conString: buildConnectionString(),
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15,
  });

  const ultimoTouch = new Map();
  const touchOriginal = store.touch.bind(store);

  store.touch = (sid, sess, callback) => {
    const ahora = Date.now();
    if (ahora - (ultimoTouch.get(sid) || 0) < TOUCH_CADA_MS) return callback?.(null);
    ultimoTouch.set(sid, ahora);
    /* El mapa vive en memoria del proceso: si crece demasiado se vacía. Perder
       la marca solo provoca un UPDATE de más, nunca una sesión caída. */
    if (ultimoTouch.size > 10_000) ultimoTouch.clear();
    return touchOriginal(sid, sess, callback);
  };

  return store;
};

const createSessionMiddleware = () =>
  session({
    store: createThrottledStore(),
    name: env.cookieName,
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: env.isProduction,
    cookie: {
      secure: env.isProduction,
      httpOnly: true,
      sameSite: env.cookieSameSite,
      domain: env.cookieDomain,
      maxAge: 1000 * 60 * 60 * 24 * env.sessionDays,
    },
  });

module.exports = { createSessionMiddleware };
