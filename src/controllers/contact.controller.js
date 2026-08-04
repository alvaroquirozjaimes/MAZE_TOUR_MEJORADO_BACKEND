const { createContactMessage } = require('../services/contact.service');

const create = async (req, res) => {
  const result = await createContactMessage(req.body || {}, req);
  return res.status(201).json({
    message: 'Tu mensaje fue recibido correctamente.',
    ...result,
  });
};

module.exports = { create };
