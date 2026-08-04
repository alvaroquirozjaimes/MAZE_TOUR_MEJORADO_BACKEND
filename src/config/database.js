const { Sequelize } = require('sequelize');
const { env } = require('./env');

const commonOptions = {
  dialect: 'postgres',
  logging: env.dbLogging ? console.log : false,
  pool: {
    max: env.dbPoolMax,
    min: env.dbPoolMin,
    idle: env.dbPoolIdleMs,
    acquire: env.dbPoolAcquireMs,
  },
  dialectOptions: env.dbSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  define: { timestamps: true },
  retry: { max: 2 },
};

const sequelize = env.databaseUrl
  ? new Sequelize(env.databaseUrl, commonOptions)
  : new Sequelize(env.dbName, env.dbUser, env.dbPassword, {
      ...commonOptions,
      host: env.dbHost,
      port: env.dbPort,
    });

const buildConnectionString = () => {
  if (env.databaseUrl) return env.databaseUrl;
  const user = encodeURIComponent(env.dbUser);
  const password = encodeURIComponent(env.dbPassword);
  return `postgres://${user}:${password}@${env.dbHost}:${env.dbPort}/${env.dbName}`;
};

const connectDatabase = async () => {
  await sequelize.authenticate();
};

module.exports = { sequelize, connectDatabase, buildConnectionString };
