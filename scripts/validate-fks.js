const { sequelize } = require('../src/config/database');

const constraints = [
  ['Hotels', 'fk_hotels_place'],
  ['Rooms', 'fk_rooms_hotel'],
  ['Restaurants', 'fk_restaurants_place'],
  ['MenuItems', 'fk_menu_items_restaurant'],
  ['Likes', 'fk_likes_place'],
  ['Likes', 'fk_likes_user'],
  ['AdminActivityLogs', 'fk_admin_logs_user'],
  ['Places', 'fk_places_created_by'],
  ['Places', 'fk_places_updated_by'],
  ['Places', 'fk_places_deleted_by'],
  ['FullDays', 'fk_full_days_created_by'],
  ['FullDays', 'fk_full_days_updated_by'],
  ['FullDays', 'fk_full_days_deleted_by'],
  ['ContactMessages', 'chk_contact_status'],
  ['Places', 'chk_places_price_nonnegative'],
  ['Rooms', 'chk_rooms_price_nonnegative'],
  ['MenuItems', 'chk_menu_price_nonnegative'],
  ['FullDays', 'chk_full_days_price_nonnegative'],
];

const main = async () => {
  await sequelize.authenticate();
  for (const [table, constraint] of constraints) {
    try {
      await sequelize.query(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}";`);
      console.log(`OK ${constraint}`);
    } catch (error) {
      console.error(`NO VALIDADA ${constraint}: ${error.message}`);
      process.exitCode = 1;
    }
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => sequelize.close());
