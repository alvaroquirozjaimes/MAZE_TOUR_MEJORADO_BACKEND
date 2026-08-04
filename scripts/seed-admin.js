const { Op } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { User } = require('../src/models');
const { env } = require('../src/config/env');

const main = async () => {
  await sequelize.authenticate();
  if (!env.adminEmails.length) {
    console.log('ADMIN_EMAILS está vacío; no hay usuarios para promover.');
    return;
  }
  const [count] = await User.update(
    { role: 'admin' },
    { where: { email: { [Op.in]: env.adminEmails } } }
  );
  console.log(`${count} usuario(s) existente(s) configurado(s) como admin.`);
  console.log('Los correos nuevos listados en ADMIN_EMAILS se crearán como admin al iniciar sesión por primera vez.');
};

main()
  .catch((error) => {
    console.error('No se pudo sembrar el administrador:', error);
    process.exitCode = 1;
  })
  .finally(async () => sequelize.close());
