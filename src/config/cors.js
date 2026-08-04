const { env } = require('./env');

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://mazetour.com',
  'https://www.mazetour.com',
  'https://api.mazetour.com',
];

const allowedOrigins = [...new Set([...defaultOrigins, ...env.corsOrigins])];

const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Page-Size', 'X-Request-Id'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error('Origen no permitido por CORS');
    error.statusCode = 403;
    return callback(error);
  },
};

module.exports = { allowedOrigins, corsOptions };
