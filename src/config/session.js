const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { env } = require('./env');
const { buildConnectionString } = require('./database');

const PgSession = connectPgSimple(session);

const createSessionMiddleware = () =>
  session({
    store: new PgSession({
      conString: buildConnectionString(),
      tableName: 'session',
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
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
