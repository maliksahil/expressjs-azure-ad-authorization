'use strict';
var express = require('express');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var passport = require('passport');
var bunyan = require('bunyan');
var request = require('request');

var log = new bunyan({
    name: 'client-app',
    streams: [
        {
            stream: process.stdout,
            level: 'debug',
            formatter: 'pretty'
        },
        {
            path: 'hello.log',
            level: 'trace'
        }
    ],
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res
    }
});

// var morgan = require('morgan');
var config = require('./config');

// set up database for express session
var MongoStore = require('connect-mongo')(expressSession);
var mongoose = require('mongoose');

var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
// Serialize deserialize user in and out of session.
passport.serializeUser(function (user, done) {
    done(null, user.oid);
});

passport.deserializeUser(function (oid, done) {
    findByOid(oid, function (err, user) {
        done(err, user);
    });
});

// array to hold logged in users
var users = [];

var findByOid = function (oid, fn) {
    for (var i = 0, len = users.length; i < len; i++) {
        var user = users[i];
        log.info('we are using user: ', user);
        if (user.oid === oid) {
            return fn(null, user);
        }
    }
    return fn(null, null);
};

// setup authn
passport.use(new OIDCStrategy({
    identityMetadata: config.creds.identityMetadata,
    clientID: config.creds.clientID,
    responseType: config.creds.responseType,
    responseMode: config.creds.responseMode,
    redirectUrl: config.creds.redirectUrl,
    allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,
    clientSecret: config.creds.clientSecret,
    validateIssuer: config.creds.validateIssuer,
    isB2C: config.creds.isB2C,
    issuer: config.creds.issuer,
    passReqToCallback: config.creds.passReqToCallback,
    scope: config.creds.scope,
    loggingLevel: config.creds.loggingLevel,
    nonceLifetime: config.creds.nonceLifetime,
    nonceMaxAmount: config.creds.nonceMaxAmount,
    useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
    cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
    clockSkew: config.creds.clockSkew,
},
    function (iss, sub, profile, accessToken, refreshToken, done) {
        if (!profile.oid) {
            return done(new Error("No oid found"), null);
        }
        process.nextTick(function () {
            findByOid(profile.oid, function (err, user) {
                if (err) {
                    return done(err);
                }
                if (!user) {
                    profile.accessToken = accessToken;
                    profile.refreshToken = refreshToken;
                    users.push(profile);
                    return done(null, profile);
                }
                return done(null, user);
            });
        });
    }
));

// Configure the app
var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(methodOverride());
app.use(cookieParser());

// Setup middleware
if (config.useMongoDBSessionStore) {
    mongoose.connect(config.databaseUri);
    app.use(express.session({
        secret: 'secret',
        cookie: { maxAge: config.mongoDBSessionMaxAge * 1000 },
        store: new MongoStore({
            mongooseConnection: mongoose.connection,
            clear_interval: config.mongoDBSessionMaxAge
        })
    }));
} else {
    app.use(expressSession({ secret: 'keyboard cat', resave: true, saveUninitialized: false }));
}

app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Passport!
app.use(passport.initialize());
app.use(passport.session());
// app.use(app.router);
app.use(express.static(__dirname + '/../../public'));

// Route controller
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login');
};

app.get('/', function (req, res) {
    res.render('index', { user: req.user });
});

// '/account' is only available to logged in user
app.get('/account', ensureAuthenticated, function (req, res) {
    res.render('account', { user: req.user });
});

// '/callapi' is only available to logged in user
app.get('/callapi', ensureAuthenticated, function (req, res) {
    res.render('callapi', { user: req.user });
});

app.post('/crossdomaincall', ensureAuthenticated, function (req, res) {
    var location = 'http://localhost:5000/admin';
    console.log(req.user.accessToken);
    request.post({
        headers: { 'content-type': 'application/json', 'Authorization' : 'Bearer ' + req.user.accessToken }
        , url: location, body: ''
    }, function (error, response, body) {
        console.log(body);
    });
});

app.get('/login',
    function (req, res, next) {
        passport.authenticate('azuread-openidconnect',
            {
                response: res,                      // required
                resourceURL: config.resourceURL,    // optional. Provide a value if you want to specify the resource.
                customState: 'my_state',            // optional. Provide a value if you want to provide custom state value.
                failureRedirect: '/'
            }
        )(req, res, next);
    },
    function (req, res) {
        log.info('Login was called in the Sample');
        res.redirect('/');
    });

// return URI, if authn fails, you get redirected to root, otherwise it goes to next middleware component
app.get('/auth/openid/return',
    function (req, res, next) {
        passport.authenticate('azuread-openidconnect',
            {
                response: res,                      // required
                failureRedirect: '/'
            }
        )(req, res, next);
    },
    function (req, res) {
        log.info('We received a return from AzureAD.');
        res.redirect('/');
    });

app.post('/auth/openid/return',
    function (req, res, next) {
        // handle req.body for error here
        passport.authenticate('azuread-openidconnect',
            {
                response: res,                      // required
                failureRedirect: '/'
            }
        )(req, res, next);
    },
    function (req, res) {
        log.info('We received a return from AzureAD.');
        res.redirect('/');
    });

// 'logout' route, logout from passport, and destroy the session with AAD.
app.get('/logout', function (req, res) {
    req.session.destroy(function (err) {
        req.logOut();
        res.redirect(config.destroySessionUrl);
    });
});

app.listen(3000);
