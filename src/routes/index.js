const express = require('express');
const placeRoutes = require('./place.routes');
const hotelRoutes = require('./hotel.routes');
const restaurantRoutes = require('./restaurant.routes');
const chatRoutes = require('./chat.routes');
const authRoutes = require('./auth.routes');
const fullDayRoutes = require('./full-day.routes');
const adminDashboardRoutes = require('./admin-dashboard.routes');
const contactRoutes = require('./contact.routes');
const locationRoutes = require('./location.routes');
const mapRoutes = require('./map.routes');
const complaintRoutes = require('./complaint.routes');

const router = express.Router();
router.use(placeRoutes);
router.use(hotelRoutes);
router.use(restaurantRoutes);
router.use(chatRoutes);
router.use(contactRoutes);
router.use(locationRoutes);
router.use(mapRoutes);
router.use(authRoutes);
/* Antes de adminDashboardRoutes: complaint.routes declara su
   propio prefijo /admin/complaints y si se monta después, el
   router de dashboard se lo come. */
router.use(complaintRoutes);
router.use('/fulldays', fullDayRoutes);
router.use('/admin', adminDashboardRoutes);
module.exports = router;
