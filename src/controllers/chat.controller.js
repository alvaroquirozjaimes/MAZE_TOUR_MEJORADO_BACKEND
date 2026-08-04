const { AppError } = require('../utils/app-error');
const { answerChat } = require('../services/chat.service');

const chat = async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) throw new AppError('El mensaje es obligatorio.', 400);
  if (message.length > 1000) throw new AppError('El mensaje es demasiado largo.', 400);
  return res.status(200).json(await answerChat(message));
};

module.exports = { chat };
