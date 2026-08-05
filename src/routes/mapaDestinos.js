const express = require('express');
const router = express.Router();
const destinationController = require('../controllers/destinationController');
const mapPointController = require('../controllers/mapPointController');

// Reutiliza aquí la autenticación real de Maze Tour.
// Ejemplo basado en Fibertel:
// const { authMiddleware, roleMiddleware } = require('../middleware/auth');
// router.use(authMiddleware);

router.get('/destinos', destinationController.getAll);
router.get('/destinos/:id', destinationController.getById);
router.post('/destinos', destinationController.create);
router.put('/destinos/:id', destinationController.update);
router.delete('/destinos/:id', destinationController.remove);

router.get('/puntos', mapPointController.getAll);
router.post('/puntos', mapPointController.create);
router.put('/puntos/:id/mover', mapPointController.move);
router.put('/puntos/:id', mapPointController.update);
router.delete('/puntos/:id', mapPointController.remove);

module.exports = router;
