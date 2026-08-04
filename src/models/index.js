const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = require('./user')(sequelize, DataTypes);
const Place = require('./place')(sequelize, DataTypes);
const Hotel = require('./hotel')(sequelize, DataTypes);
const Room = require('./room')(sequelize, DataTypes);
const Restaurant = require('./restaurant')(sequelize, DataTypes);
const MenuItem = require('./menu-item')(sequelize, DataTypes);
const Like = require('./like')(sequelize, DataTypes);
const FullDay = require('./full-day')(sequelize, DataTypes);
const AdminActivityLog = require('./admin-activity-log')(sequelize, DataTypes);
const ContactMessage = require('./contact-message')(sequelize, DataTypes);
const ApiRateLimit = require('./api-rate-limit')(sequelize, DataTypes);

Place.hasMany(Hotel, { as: 'hotels', foreignKey: 'placeId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Hotel.belongsTo(Place, { as: 'place', foreignKey: 'placeId' });
Hotel.hasMany(Room, { as: 'rooms', foreignKey: 'hotelId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Room.belongsTo(Hotel, { as: 'hotel', foreignKey: 'hotelId' });
Place.hasMany(Restaurant, { as: 'restaurants', foreignKey: 'placeId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Restaurant.belongsTo(Place, { as: 'place', foreignKey: 'placeId' });
Restaurant.hasMany(MenuItem, { as: 'menuItems', foreignKey: 'restaurantId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MenuItem.belongsTo(Restaurant, { as: 'restaurant', foreignKey: 'restaurantId' });
Place.hasMany(Like, { as: 'likes', foreignKey: 'placeId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Like.belongsTo(Place, { as: 'place', foreignKey: 'placeId' });
User.hasMany(Like, { as: 'likes', foreignKey: 'userId', sourceKey: 'googleId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Like.belongsTo(User, { as: 'user', foreignKey: 'userId', targetKey: 'googleId' });
User.hasMany(AdminActivityLog, { as: 'activityLogs', foreignKey: 'userId', sourceKey: 'googleId', onDelete: 'SET NULL' });
AdminActivityLog.belongsTo(User, { as: 'user', foreignKey: 'userId', targetKey: 'googleId' });

module.exports = {
  sequelize,
  User,
  Place,
  Hotel,
  Room,
  Restaurant,
  MenuItem,
  Like,
  FullDay,
  AdminActivityLog,
  ContactMessage,
  ApiRateLimit,
};
