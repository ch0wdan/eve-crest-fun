var config = require('./config.json');

var Promise = require('bluebird');
var _ = require('lodash');
var request = Promise.promisify(require('request'));

var knex = require('knex');
var eveData = require('./lib/eveData');

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Collection = mongodb.Collection;

Promise.promisifyAll(Collection.prototype);
Promise.promisifyAll(MongoClient);

var mongoUrl = 'mongodb://localhost:27017/eve-crest-fun';

var MAX_AGE = 2 * 3600 * 1000;

var crestBase = 'https://crest-tq.eveonline.com';

var dbPlay, regionID, refreshToken, accessToken, typesTotal, typesDone;

MongoClient.connectAsync(mongoUrl).then(function (db) {
  dbPlay = db;
  return authorize(config);
}).then(function (result) {
  refreshToken = result.refresh_token;
  accessToken = result.access_token;
}).then(function (result) {
  return eveData.mapRegions({ regionName: 'Domain' });
}).then(function (regions) {
  regionID = regions[0].regionID;
  return eveData.invTypes({ marketGroupID: [
    4, // Ships
    9, // Ship Equipment
    11, // Ammunition & Charges
    157, // Drones
    955 // Ship Modifications
  ]});
}).then(function (types) {
  console.log('Scanning ' + types.length + ' types');
  return types;
  return types.slice(0, 5);
}).then(function (types) {
  typesTotal = types.length;
  typesDone = 0;
  return types;
}).map(function (type) {
  return fetchPrice(dbPlay, accessToken, regionID, type).then(function (doc) {
    typesDone++;
    console.log([
      parseInt(( typesDone / typesTotal ) * 100),
      '% (', typesDone, ' / ', typesTotal, ')'
    ].join(''));
    return doc;
  });
}, { concurrency: 10 })

/*
.then(function (result) {
  console.log(JSON.stringify(result, null, '  '));
})
*/
.map(function (type) {
  console.log([
    type.typeName,
    'S:', type.market[regionID].sell,
    'B:', type.market[regionID].buy,
    'M:', type.market[regionID].margin
  ].join(' '));
})
.catch(console.error).finally(function () {
  dbPlay.close();
  eveData.close();
}).done();

function fetchPrice (db, accessToken, regionID, type) {
  var now = Date.now();

  var ordersBase = crestBase + '/market/' + regionID + '/orders/';
  var typeUrl = 'http://public-crest.eveonline.com/types/' + type.typeID + '/';
  var opts = { method: 'GET', json: true, auth: { bearer: accessToken } };

  var _id = type.typeID;

  var typeCollection;

  return db.collection('type').findOneAsync({ _id: _id }).then(function (doc) {

    if (doc) {
      if ((now - doc.updatedAt) < MAX_AGE) {
        return doc;
      }
    } else {
      doc = _.assign(
        { _id: _id, _model: 'type' },
        _.pick(type, 'typeID', 'typeName', 'volume', 'marketGroupID', 'groupID')
      );
    }

    doc.updatedAt = now;

    return Promise.props({
      sell: request(_.assign({
        url: ordersBase + 'sell/?type=' + typeUrl
      }, opts)),
      buy: request(_.assign({
        url: ordersBase + 'buy/?type=' + typeUrl
      }, opts)),
      history: request({
        method: 'GET',
        json: true,
        url: 'http://public-crest.eveonline.com/market/' + regionID +
          '/types/' + type.typeID + '/history/'
      }),
    }).then(function (results) {

      var market = {
        history: results.history[1].items,
        sellOrders: results.sell[1].items,
        buyOrders: results.buy[1].items
      };

      var topBuy = _.sortBy(market.buyOrders, 'price').reverse()[0];
      if (topBuy) { market.buy = topBuy.price; }

      var topSell = _.sortBy(market.sellOrders, 'price')[0];
      if (topSell) { market.sell = topSell.price; }

      if (market.buy && market.sell) {
        market.spread = market.sell - market.buy;
        market.margin = (market.spread / market.buy) * 100.0;
      }

      if (!doc.market) { doc.market = {}; }
      doc.market[regionID] = market;

      return Promise.all([
        doc, db.collection('type').updateAsync({ _id: _id }, doc, { upsert: true })
      ]);

    }).spread(function (doc, results) {
      return doc
    });

  });
}

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
