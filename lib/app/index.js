var util = require('util');
var http = require('http');
var path = require('path');
var fs = require('fs');

var _ = require('lodash');
var Promise = require('bluebird');
var requireDir = require('require-dir');
var express = require('express');
var nunjucks = require('nunjucks');
var passport = require('passport');
var browserify = require('browserify-middleware');
var rework = require('rework');
var reworkNPM = require('rework-npm');

module.exports = function (options, shared) {
  var config = shared.config;
  var logger = shared.logger;

  var app = express();

  app
    .set('port', config.port)
    .set('views', path.join(__dirname, '../../views'));

  app
    .use(require('morgan')('dev'))
    .use(require('method-override')('_method'))
    .use(require('express-json')())
    .use(require('body-parser').urlencoded({ extended: true }))
    .use(require('cookie-parser')())
    .use(require('cookie-session')({ secret: config.secret }))
    .use(require('connect-flash')())
    .use(passport.initialize())
    .use(passport.session());

  app.use('/js', browserify('./public-src/js'));

  app.use('/css', function (req, res, next) {
    var filepath = path.join(__dirname, '../../public-src/css' + req.path);
    fs.readFile(filepath, {encoding: 'utf8'}, function (err, content) {
      if (err) { return next(); }
      res.setHeader('Content-Type', 'text/css');
      res.end(rework(content, { source: filepath })
        .use(reworkNPM())
        .toString());
    });
  });

  app.use(require('serve-static')(path.join(__dirname, '../../public')));

  // Grab EVE headers
  app.use(function (req, res, next) {
    req.eve = {};
    _.each(req.headers, function (val, name) {
      if (name.indexOf('eve_') !== 0) { return; }
      var prop = name.substr(4);
      if ('trusted' == prop) {
        val = ('Yes' == val);
      }
      req.eve[prop] = val;
    });
    next();
  });

  // Common template locals
  app.use(function (req, res, next) {
    _.extend(res.locals, {
      request: req,
      user: req.user ? req.user.toJSON() : null,
      message: req.flash('message'),
      eve: req.eve,
      eve_json: JSON.stringify(req.eve)
    });
    next();
  });

  if (process.env.NODE_ENV === 'development') {
    // only use in development
    app.use(require('errorhandler')())
  }

  nunjucks.configure('views', {
    autoescape: true,
    express: app
  });

  app.route('/').get(function (req, res) {
    res.render('index.html');
  })

  var cmds = requireDir();
  for (name in cmds) {
    cmds[name](options, shared, app);
  }

  options = options || {};
  var port = options.port || app.get('port');
  return new Promise(function (fulfill, reject) {
    var server = http.createServer(app).listen(port, function () {
      server.port = port;
      fulfill(server);
    });
  });

};
