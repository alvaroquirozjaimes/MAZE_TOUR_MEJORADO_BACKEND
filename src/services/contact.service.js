const { ContactMessage } = require('../models');
const { AppError } = require('../utils/app-error');

const clean = (value, max) => String(value || '').trim().slice(0, max);

/* El celular sustituye al correo como único dato de contacto, así que
   ahora sí hay que validarlo. Se aceptan espacios, guiones, paréntesis
   y un "+" inicial porque la gente los escribe, pero se cuentan solo
   los dígitos: entre 6 y 15, que es el rango de la norma E.164. */
const normalizePhone = (value) => {
  const raw = clean(value, 40);
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return raw;
};

const createContactMessage = async (body, req) => {
  // Campo trampa para bots; el formulario real lo deja vacío.
  if (body.website) return { accepted: true };
  const name = clean(body.name, 150);
  const phone = normalizePhone(body.phone);
  const message = clean(body.message, 5000);

  if (!name || !clean(body.phone, 40) || !message) {
    throw new AppError('Nombre, celular y mensaje son obligatorios.', 400);
  }
  if (!phone) throw new AppError('El número de celular no es válido.', 400);
  if (message.length < 10) throw new AppError('El mensaje debe tener al menos 10 caracteres.', 400);

  const created = await ContactMessage.create({
    name,
    phone,
    /* La columna sigue existiendo por los mensajes antiguos, pero el
       formulario ya no la envía y aquí no se lee del body: si alguien
       postea un "email" a mano, se ignora. */
    email: null,
    message,
    ipAddress: req.ip || null,
    status: 'new',
  });
  return { accepted: true, id: created.id };
};

module.exports = { createContactMessage };
