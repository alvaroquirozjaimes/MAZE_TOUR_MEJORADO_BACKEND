const express = require('express');
const controller = require('../controllers/complaint.controller');
const { createRateLimit } = require('../middleware/rate-limit');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

/* Más permisivo que el formulario de contacto: presentar un
   reclamo es un derecho y bloquear a alguien que se equivocó al
   escribir su DNI dos veces sería un problema, no una defensa.
   Pero sigue habiendo tope: el correlativo se quema con cada
   intento válido. */
const complaintLimit = createRateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  scope: 'complaint',
  message: 'Has enviado demasiadas hojas. Intenta nuevamente en una hora.',
});

const statusLimit = createRateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  scope: 'complaint-status',
  message: 'Demasiadas consultas. Intenta nuevamente en unos minutos.',
});

/* ---------- Público ---------- */
router.post('/complaints', complaintLimit, asyncHandler(controller.create));
router.get('/complaints/status', statusLimit, asyncHandler(controller.status));

/* ---------- Administración ---------- */
router.get('/admin/complaints', requireAdmin, asyncHandler(controller.list));
router.patch('/admin/complaints/:id/respond', requireAdmin, asyncHandler(controller.respond));
router.patch('/admin/complaints/:id/extend', requireAdmin, asyncHandler(controller.extend));

module.exports = router;
