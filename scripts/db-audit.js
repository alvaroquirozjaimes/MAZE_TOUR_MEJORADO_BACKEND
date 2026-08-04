const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/database');

const checks = [
  ['Hoteles sin lugar', 'SELECT COUNT(*)::int AS count FROM "Hotels" h LEFT JOIN "Places" p ON p."id"=h."placeId" WHERE p."id" IS NULL'],
  ['Habitaciones sin hotel', 'SELECT COUNT(*)::int AS count FROM "Rooms" r LEFT JOIN "Hotels" h ON h."id"=r."hotelId" WHERE h."id" IS NULL'],
  ['Restaurantes sin lugar', 'SELECT COUNT(*)::int AS count FROM "Restaurants" r LEFT JOIN "Places" p ON p."id"=r."placeId" WHERE p."id" IS NULL'],
  ['Ítems sin restaurante', 'SELECT COUNT(*)::int AS count FROM "MenuItems" m LEFT JOIN "Restaurants" r ON r."id"=m."restaurantId" WHERE r."id" IS NULL'],
  ['Likes sin lugar', 'SELECT COUNT(*)::int AS count FROM "Likes" l LEFT JOIN "Places" p ON p."id"=l."placeId" WHERE p."id" IS NULL'],
  ['Likes sin usuario', 'SELECT COUNT(*)::int AS count FROM "Likes" l LEFT JOIN "Users" u ON u."googleId"=l."userId" WHERE u."googleId" IS NULL'],
  ['Lugares con precio negativo', 'SELECT COUNT(*)::int AS count FROM "Places" WHERE "price" < 0'],
  ['Habitaciones con precio negativo', 'SELECT COUNT(*)::int AS count FROM "Rooms" WHERE "price" < 0'],
  ['Ítems de menú con precio negativo', 'SELECT COUNT(*)::int AS count FROM "MenuItems" WHERE "dishPrice" < 0'],
  ['Full Days con precio negativo', 'SELECT COUNT(*)::int AS count FROM "FullDays" WHERE "price" < 0'],
  ['Mensajes con estado inválido', `SELECT COUNT(*)::int AS count FROM "ContactMessages" WHERE "status" NOT IN ('new','read','archived')`],
  ['Usuarios con rol inválido', `SELECT COUNT(*)::int AS count FROM "Users" WHERE "role" NOT IN ('admin','user')`],
  ['Usuarios con contador de ingresos inválido', 'SELECT COUNT(*)::int AS count FROM "Users" WHERE "loginCount" < 0'],
  ['Usuarios con último acceso anterior al registro', 'SELECT COUNT(*)::int AS count FROM "Users" WHERE "lastLoginAt" IS NOT NULL AND "lastLoginAt" < "createdAt"'],
  ['Lugares con autor inexistente', `SELECT COUNT(*)::int AS count FROM "Places" p WHERE (p."createdBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=p."createdBy")) OR (p."updatedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=p."updatedBy")) OR (p."deletedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=p."deletedBy"))`],
  ['Full Days con autor inexistente', `SELECT COUNT(*)::int AS count FROM "FullDays" f WHERE (f."createdBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=f."createdBy")) OR (f."updatedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=f."updatedBy")) OR (f."deletedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."googleId"=f."deletedBy"))`],
];

const main = async () => {
  await sequelize.authenticate();
  let problems = 0;
  for (const [label, sql] of checks) {
    const [row] = await sequelize.query(sql, { type: QueryTypes.SELECT });
    const count = Number(row.count) || 0;
    problems += count;
    console.log(`${count ? 'ADVERTENCIA' : 'OK'} ${label}: ${count}`);
  }
  if (problems) {
    console.log(`Se encontraron ${problems} problema(s). Corrígelos antes de ejecutar npm run db:validate-fks.`);
    process.exitCode = 2;
  } else {
    console.log('Integridad referencial y restricciones listas para validar.');
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => sequelize.close());
