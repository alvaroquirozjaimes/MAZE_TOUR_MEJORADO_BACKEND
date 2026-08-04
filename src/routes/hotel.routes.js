const express = require('express');
const { getById } = require('../controllers/hotel.controller');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.get('/hotels/:id', asyncHandler(getById));
module.exports = router;
