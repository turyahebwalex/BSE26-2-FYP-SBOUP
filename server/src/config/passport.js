const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const configurePassport = () => {
  // JWT Strategy
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'dev-secret',
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (payload, done) => {
      try {
        const user = await User.findById(payload.id).select('-passwordHash');
        if (!user || user.accountStatus !== 'active') {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    })
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
              // Link OAuth if not already linked
              if (!user.oauthProvider) {
                user.oauthProvider = 'google';
                user.isEmailVerified = true;
                await user.save();
              }
              return done(null, user);
            }

            // Create new user from Google profile
            user = await User.create({
              email: profile.emails[0].value,
              fullName: profile.displayName,
              passwordHash: 'oauth-no-password',
              role: 'skilled_worker', // Default role; can be changed later
              oauthProvider: 'google',
              isEmailVerified: true,
              accountStatus: 'active',
            });

            return done(null, user);
          } catch (error) {
            return done(error, false);
          }
        }
      )
    );
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
  });
};

module.exports = { configurePassport };
