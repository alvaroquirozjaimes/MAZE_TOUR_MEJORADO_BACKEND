const passport = require('passport');
const { literal } = require('sequelize');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { env } = require('./env');
const { normalizeEmail } = require('./access');
const { User } = require('../models');

const googleAuthEnabled = Boolean(
  env.googleClientId && env.googleClientSecret && env.googleCallbackUrl
);

const initialRoleForEmail = (email) =>
  env.adminEmails.includes(normalizeEmail(email)) ? 'admin' : 'user';

if (googleAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = normalizeEmail(profile.emails?.[0]?.value) || null;
          const loginAt = new Date();
          const values = {
            name: profile.displayName || email || 'Usuario',
            email,
            avatar: profile.photos?.[0]?.value || null,
          };

          const [user, created] = await User.findOrCreate({
            where: { googleId: profile.id },
            defaults: {
              ...values,
              role: initialRoleForEmail(email),
              lastLoginAt: loginAt,
              loginCount: 1,
            },
          });

          if (!created) {
            // El rol no se modifica al iniciar sesión. Solo se actualizan el perfil y la actividad.
            await User.update(
              {
                ...values,
                lastLoginAt: loginAt,
                loginCount: literal('COALESCE("loginCount", 0) + 1'),
              },
              { where: { googleId: profile.id } }
            );
            await user.reload();
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user.googleId));

passport.deserializeUser(async (googleId, done) => {
  try {
    const user = await User.findByPk(googleId);
    return done(null, user || false);
  } catch (error) {
    return done(error);
  }
});

module.exports = { passport, googleAuthEnabled };
