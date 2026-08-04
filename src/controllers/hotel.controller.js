const { isAdminUser } = require('../config/access');
const { getHotel } = require('../services/hotel.service');
const { ensureId } = require('../utils/parsers');

const getById = async (req, res) => {
  const result = await getHotel(ensureId(req.params.id), req.query, {
    includeHidden: isAdminUser(req.user),
  });
  if (req.headers['if-none-match'] === result.etag) return res.status(304).end();
  res.setHeader('ETag', result.etag);
  return res.status(200).json(result.data);
};

module.exports = { getById };
