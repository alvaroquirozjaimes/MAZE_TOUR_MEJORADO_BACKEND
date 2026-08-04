const crypto = require('crypto');

const validRequestId = (value) => /^[A-Za-z0-9._:-]{1,100}$/.test(String(value || ''));

const requestContext = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = validRequestId(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

module.exports = { requestContext, validRequestId };
