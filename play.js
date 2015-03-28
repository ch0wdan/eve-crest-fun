var config = require('./config.json');

var Promise = require('bluebird');
var request = Promise.promisify(require('request'));
var knex = require('knex');

var accessToken;

var staticDb = knex({
  client: 'sqlite3',
  connection: { filename: './sqlite-latest.sqlite' }
});

authorize(config).then(function (result) {

  refreshToken = result.refresh_token;
  accessToken = result.access_token;

  return whoami(accessToken);

}).then(function (result) {

  var apiBase = 'https://crest-tq.eveonline.com';
  var regionId = '10000043';
  var typeUrl = 'http://public-crest.eveonline.com/types/12346/';

  return request({
    method: 'GET',
    url: apiBase + '/market/' + regionId + '/orders/sell/?type=' + typeUrl,
    json: true,
    auth: { bearer: accessToken },
  }).spread(function (response, body) {
    return JSON.stringify(body, null, '  ');
  });

})
.then(console.log).catch(console.error);

function authorize (config) {

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

function whoami (accessToken) {
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
