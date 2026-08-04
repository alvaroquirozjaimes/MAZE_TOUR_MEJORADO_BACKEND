const express = require('express');
const { getById } = require('../controllers/restaurant.controller');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.get('/restaurants/:id', asyncHandler(getById));
module.exports = router;
