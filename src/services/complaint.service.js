const { QueryTypes } = require('sequelize');
const { sequelize, Complaint } = require('../models');
const { AppError } = require('../utils/app-error');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

/* ============================================================
   Plazo legal: 15 días hábiles desde la presentación.

   Solo se saltan sábados y domingos. Los feriados nacionales NO
   están contemplados: cambian cada año y meterlos aquí obligaría
   a mantener un calendario que nadie va a actualizar. El efecto
   es que la fecha calculada es más exigente que la legal, lo que
   juega a favor del consumidor y nunca en contra tuya.
   ============================================================ */
const BUSINESS_DAYS = 15;

const addBusinessDays = (from, days) => {
  const date = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date;
};

/* ============================================================
   Validación
   ============================================================ */

const DOCUMENT_TYPES = ['DNI', 'CE', 'PASAPORTE', 'RUC'];

/* DNI son 8 dígitos y RUC 11. Validarlo evita el caso más común
   de hoja inútil: un número mal tecleado con el que después no
   puedes identificar a quién respondes. */
const validateDocument = (type, number) => {
  const digits = number.replace(/\D/g, '');
  if (type === 'DNI' && digits.length !== 8) {
    throw new AppError('El DNI debe tener 8 dígitos.', 400);
  }
  if (type === 'RUC' && digits.length !== 11) {
    throw new AppError('El RUC debe tener 11 dígitos.', 400);
  }
  if (number.length < 6) {
    throw new AppError('El número de documento no es válido.', 400);
  }
};

const parseAmount = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError('El monto reclamado no es válido.', 400);
  }
  if (amount > 99_999_999) throw new AppError('El monto reclamado es demasiado alto.', 400);
  return Number(amount.toFixed(2));
};

/* Correlativo LR-2026-000001.

   La secuencia se consume dentro de la misma transacción que el
   INSERT, pero nextval() no se revierte con ROLLBACK: si el
   insert falla, ese número queda quemado y el siguiente reclamo
   usará el posterior. Es intencional. La norma pide correlativo,
   no consecutivo sin huecos, y un hueco es infinitamente menos
   grave que dos hojas con el mismo número. */
const nextCode = async (transaction) => {
  const [row] = await sequelize.query("SELECT nextval('complaint_code_seq') AS value;", {
    type: QueryTypes.SELECT,
    transaction,
  });
  const number = String(row.value).padStart(6, '0');
  return `LR-${new Date().getFullYear()}-${number}`;
};

/* ============================================================
   Alta de una hoja de reclamación
   ============================================================ */

const createComplaint = async (body, req) => {
  // Campo trampa para bots, igual que en el formulario de contacto.
  if (body.website) return { accepted: true };

  const kind = clean(body.kind, 10).toLowerCase();
  if (!['reclamo', 'queja'].includes(kind)) {
    throw new AppError('Indica si se trata de un reclamo o de una queja.', 400);
  }

  const fullName = clean(body.fullName, 180);
  const documentType = clean(body.documentType, 20).toUpperCase();
  const documentNumber = clean(body.documentNumber, 20);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40) || null;
  const address = clean(body.address, 255);
  const isMinor = Boolean(body.isMinor);
  const guardianName = clean(body.guardianName, 180) || null;

  const itemType = clean(body.itemType, 10).toLowerCase();
  const itemDescription = clean(body.itemDescription, 2000);
  const detail = clean(body.detail, 5000);
  const request = clean(body.request, 3000);

  if (!fullName || !documentNumber || !email || !address || !itemDescription || !detail || !request) {
    throw new AppError('Faltan datos obligatorios en la hoja de reclamación.', 400);
  }
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new AppError('El tipo de documento no es válido.', 400);
  }
  validateDocument(documentType, documentNumber);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('El correo electrónico no es válido.', 400);
  }
  if (!['producto', 'servicio'].includes(itemType)) {
    throw new AppError('Indica si tu reclamo es sobre un producto o un servicio.', 400);
  }
  if (isMinor && !guardianName) {
    throw new AppError('Si el consumidor es menor de edad, indica el nombre del padre o tutor.', 400);
  }
  if (detail.length < 20) {
    throw new AppError('Describe el detalle con al menos 20 caracteres.', 400);
  }
  if (request.length < 10) {
    throw new AppError('Indica qué solución esperas.', 400);
  }

  const amountClaimed = parseAmount(body.amountClaimed);
  const createdAt = new Date();
  const dueAt = addBusinessDays(createdAt, BUSINESS_DAYS);

  const complaint = await sequelize.transaction(async (transaction) => {
    const code = await nextCode(transaction);
    return Complaint.create(
      {
        code,
        kind,
        fullName,
        documentType,
        documentNumber,
        email,
        phone,
        address,
        isMinor,
        guardianName,
        itemType,
        itemDescription,
        amountClaimed,
        currency: 'PEN',
        detail,
        request,
        status: 'pending',
        dueAt,
        ipAddress: req.ip || null,
      },
      { transaction }
    );
  });

  return {
    accepted: true,
    code: complaint.code,
    kind: complaint.kind,
    createdAt: complaint.createdAt,
    dueAt: complaint.dueAt,
  };
};

/* ============================================================
   Consulta pública del estado

   Se exige código + número de documento. El código solo no basta:
   es correlativo y por tanto adivinable, y detrás hay nombre,
   dirección y documento de una persona.
   ============================================================ */

const findComplaintStatus = async ({ code, documentNumber }) => {
  const safeCode = clean(code, 24).toUpperCase();
  const safeDocument = clean(documentNumber, 20);
  if (!safeCode || !safeDocument) {
    throw new AppError('Indica el código de la hoja y tu número de documento.', 400);
  }

  const complaint = await Complaint.findOne({
    where: { code: safeCode, documentNumber: safeDocument },
    attributes: ['code', 'kind', 'status', 'createdAt', 'dueAt', 'extendedUntil', 'response', 'respondedAt'],
  });

  /* Mismo mensaje exista o no la hoja: si dijéramos "código
     correcto, documento incorrecto" tendríamos un buscador de
     documentos por fuerza bruta. */
  if (!complaint) {
    throw new AppError('No encontramos una hoja con esos datos.', 404);
  }
  return complaint;
};

/* ============================================================
   Bandeja del administrador
   ============================================================ */

const listComplaints = async ({ status, page = 1, pageSize = 20 } = {}) => {
  const where = {};
  if (['pending', 'answered', 'closed'].includes(status)) where.status = status;

  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const { rows, count } = await Complaint.findAndCountAll({
    where,
    /* Las pendientes primero y, dentro de ellas, la más próxima a
       vencer arriba. La bandeja se ordena por urgencia legal, no
       por fecha de llegada. */
    order: [
      ['status', 'ASC'],
      ['dueAt', 'ASC'],
    ],
    limit,
    offset,
  });

  return { data: rows, total: count, page: Number(page) || 1, pageSize: limit };
};

const respondComplaint = async (id, body, req) => {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new AppError('Hoja de reclamación no encontrada.', 404);

  const response = clean(body.response, 5000);
  if (response.length < 10) {
    throw new AppError('La respuesta debe tener al menos 10 caracteres.', 400);
  }

  await complaint.update({
    response,
    status: 'answered',
    respondedAt: new Date(),
    respondedBy: req.user?.googleId || null,
  });

  return complaint;
};

/* Ampliación excepcional de 15 días hábiles más. La norma exige
   comunicar la ampliación al consumidor antes de que venza el
   plazo original, así que registrar la fecha aquí no te exime de
   enviarle el aviso. */
const extendComplaint = async (id) => {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new AppError('Hoja de reclamación no encontrada.', 404);
  if (complaint.extendedUntil) {
    throw new AppError('Esta hoja ya tiene una ampliación registrada.', 409);
  }
  if (complaint.status !== 'pending') {
    throw new AppError('Solo se puede ampliar el plazo de una hoja pendiente.', 409);
  }

  await complaint.update({ extendedUntil: addBusinessDays(complaint.dueAt, BUSINESS_DAYS) });
  return complaint;
};

module.exports = {
  createComplaint,
  findComplaintStatus,
  listComplaints,
  respondComplaint,
  extendComplaint,
  addBusinessDays,
};
