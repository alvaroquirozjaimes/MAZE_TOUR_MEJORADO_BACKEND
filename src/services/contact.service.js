const { ContactMessage } = require('../models');
const { AppError } = require('../utils/app-error');

const clean = (value, max) => String(value || '').trim().slice(0, max);

const createContactMessage = async (body, req) => {
  // Campo trampa para bots; el formulario real lo deja vacío.
  if (body.website) return { accepted: true };
  const name = clean(body.name, 150);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40) || null;
  const message = clean(body.message, 5000);
  if (!name || !email || !message) throw new AppError('Nombre, correo y mensaje son obligatorios.', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('El correo no es válido.', 400);
  if (message.length < 10) throw new AppError('El mensaje debe tener al menos 10 caracteres.', 400);

  const created = await ContactMessage.create({
    name,
    email,
    phone,
    message,
    ipAddress: req.ip || null,
    status: 'new',
  });
  return { accepted: true, id: created.id };
};

module.exports = { createContactMessage };
