const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isAdminUser = (user) =>
  Boolean(user && String(user.role || '').trim().toLowerCase() === 'admin');

module.exports = { isAdminUser, normalizeEmail };
