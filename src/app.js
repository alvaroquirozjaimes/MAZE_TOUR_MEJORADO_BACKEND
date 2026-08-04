const express = require('express');
const cors = require('cors');
const path = require('path');
const { passport } = require('./config/passport');
const { createSessionMiddleware } = require('./config/session');
const { corsOptions } = require('./config/cors');
const { env } = require('./config/env');
const { sequelize } = require('./config/database');
const apiRoutes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errors');
const { securityHeaders } = require('./middleware/security');
const { requestContext } = require('./middleware/request-context');

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProduction ? 1 : false);
  app.use(requestContext);
  app.use(cors(corsOptions));
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  const staticOptions = {
    maxAge: env.isProduction ? '30d' : 0,
    immutable: env.isProduction,
    fallthrough: true,
  };
  app.use('/uploads', express.static(env.uploadRoot, staticOptions));
  app.use('/uploads2', express.static(env.upload2Root, staticOptions));
  for (const legacyRoot of env.legacyUploadRoots) {
    if (path.resolve(legacyRoot) !== path.resolve(env.uploadRoot)) app.use('/uploads', express.static(legacyRoot, staticOptions));
  }
  for (const legacyRoot of env.legacyUpload2Roots) {
    if (path.resolve(legacyRoot) !== path.resolve(env.upload2Root)) app.use('/uploads2', express.static(legacyRoot, staticOptions));
  }

  app.get('/', (_req, res) => res.status(200).json({ status: 'ok', service: 'MAZE TOUR API', environment: env.nodeEnv, time: new Date().toISOString() }));
  app.get('/api/health/live', (_req, res) => res.status(200).json({ status: 'ok' }));
  const readiness = async (_req, res) => {
    try {
      await sequelize.authenticate();
      return res.status(200).json({ status: 'ready', database: 'ok' });
    } catch (error) {
      return res.status(503).json({ status: 'not_ready', database: 'error' });
    }
  };
  app.get('/api/health/ready', readiness);
  app.get('/api/health', readiness);
  app.use('/api', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };
