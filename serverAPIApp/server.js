var express = require('express');
var passport = require('passport');

var BearerStrategy = require("passport-azure-ad").BearerStrategy;

var tenantID = "<tenantid>" ; // guid;
var clientID = "<clientid>" ; // guid
var audience = "<audience>" ; // example "https://tenantname.onmicrosoft.com/server"

var options =  {
  identityMetadata: "https://login.microsoftonline.com/" + tenantID + "/v2.0/.well-known/openid-configuration",
  clientID: clientID,
  issuer: "https://sts.windows.net/" + tenantID + "/",
  audience: audience,
  loggingLevel: "info",
  passReqToCallback: false
};

var bearerStrategy = new BearerStrategy(options, function(token, done) {
  done(null, {}, token);
});

var app = express();
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
passport.use(bearerStrategy);

// Enable CORS for * because this is a demo project
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// This is where your API methods are exposed
app.post(
  "/admin",
  passport.authenticate("oauth-bearer", { session: false }),
  function(req, res) {
    var claims = req.authInfo;
    console.log("User info: ", req.user);
    console.log("Validated claims: ", claims);
    res.status(200).json({ name: claims["name"] });
  }
);

// Run this
var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on port " + port);
});
