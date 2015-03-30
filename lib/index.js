var fs = require('fs');

var Promise = require('bluebird');
var _ = require('lodash');
var winston = require('winston');
var request = Promise.promisify(require('request'));

var eveData = require('./eveData');
var models = require('./models');

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Collection = mongodb.Collection;

Promise.promisifyAll(Collection.prototype);
Promise.promisifyAll(MongoClient);

var main = module.exports;

var DEFAULT_CONFIG = {
  mongodbUrl: 'mongodb://localhost:27017/eve-crest-fun'
};

main.initShared = function (options, next) {
  var config = main.loadConfig(options);
  var shared = { config: config };

  config.log_level = options.debug ? 'debug' :
    options.verbose ? 'verbose' :
    options.quiet ? 'error' :
    config.log_level;

  shared.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        level: config.log_level,
        colorize: true
      })
    ]
  });

  shared.logger.setLevels({
    silly: 0, debug: 1, verbose: 2,
    info: 3, warn: 4, error: 5
  });

  shared.done = function () {
    shared.db.close();
    eveData.close();
    process.exit();
  };

  models.initDatabase(config, function (err, db) {
    shared.db = db;
    return next(null, shared);
  });

};

main.loadConfig = function (options) {
  // Attempt to read config.json, but no sweat if it fails
  var configFromFile = {};
  try {
    var config_fn = __dirname+ '/../config.json';
    var configFromFile = JSON.parse(fs.readFileSync(config_fn, 'utf-8'));
  } catch (e) {
    /* no-op */
  };

  return _.defaults({}, configFromFile, DEFAULT_CONFIG);
}

main.authorizeCrest = function (config) {
  var body = (!config.refreshToken) ?
    // https://login.eveonline.com/oauth/authorize/?response_type=code&redirect_uri=https://lmorchard.github.io/eve-market-fun&client_id=028806c6ac954fa5ac2608d9e7c71ce8&scope=publicData&state=uniquestate123
    { grant_type: 'authorization_code', code: config.authCode } :
    { grant_type: 'refresh_token', refresh_token: config.refreshToken };
  return request({
    method: 'POST',
    url: 'https://login.eveonline.com/oauth/token/',
    json: true,
    auth: { user: config.clientId, pass: config.secretKey },
    body: body
  }).spread(function (response, body) {
    return body;
  });
}

main.whoami = function (accessToken) {
  return request({
    method: 'GET',
    url: 'https://login.eveonline.com/oauth/verify',
    json: true,
    // headers: { 'Authorization': 'Bearer ' + accessToken }
    auth: { bearer: accessToken },
  }).spread(function (response, body) {
    return body;
  });
}
