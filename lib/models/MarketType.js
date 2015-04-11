var _ = require('lodash');
var Promise = require('bluebird');
var eveData = require('../eveData');
var requestOrig = require('request');
// requestOrig.debug = true;
var request = Promise.promisify(requestOrig);

var main = require(__dirname + '/..');

var MAX_AGE = 10 * 60 * 1000;

module.exports = function (models, baseClass) {
  var MarketType = baseClass();

  MarketType.collection = 'MarketTypes';

  MarketType.defaults = {
    regionID: null,
    typeID: null,
    typeName: null,
    volume: null,
    marketGroupID: null,
    marketGroupIDPath: null,
    groupID: null,
    history: null,
    sellOrders: null,
    buyOrders: null,
    buy: null,
    sell: null,
    spread: null,
    margin: null,
    avgDailyVolume: null,
    avgDailyVolumeForWeek: null,
    avgDailyVolumeForMonth: null,
    volatility: null,
    volatilityForMonth: null,
    volatilityForWeek: null,
    updatedAt: null
  };

  MarketType.id = function (obj) {
    return obj.typeID + ':' + obj.regionID;
  };

  MarketType.getOrCreate = function (keyObj) {
    return MarketType.get(keyObj).then(function (obj) {
      if (obj) { return obj; }
      return eveData.invTypes({
        typeID: keyObj.typeID
      }).then(function (types) {
        if (types.length === 0) { return null; }
        var type = types[0];
        type.regionID = keyObj.regionID;
        return new MarketType(type);
      });
    });
  };

  var pasteLineBlacklist = [
    '[Empty High slot]',
    '[Empty Med slot]',
    '[Empty Low slot]',
    'High power',
    'Medium power',
    'Low power',
    'Drones'
  ];

  var reCount = new RegExp('(.+) x([0-9]+)$');
  var reFittingCount = new RegExp('([0-9]+)x (.+)');
  var reShip = new RegExp('\\[([^\\,]+), .*\\]');
  var reAssetWithCount = new RegExp('([^\\t]+)\\t([0-9]+)\\t');
  var reAssetSingular = new RegExp('([^\\t]+)\\t\\t');

  MarketType.parsePaste = function (regionID, paste) {

    var m;
    var counts = {};

    var lines = paste.split(/\n|\r\n/).filter(function (line) {

      if (!line) { return false; }

      if (pasteLineBlacklist.indexOf(line) !== -1) { return false; }

      m = reFittingCount.exec(line);
      if (m) { counts[m[2]] = m[1]; return false; }

      m = reAssetWithCount.exec(line);
      if (m) { counts[m[1]] = m[2]; return false; }

      m = reAssetSingular.exec(line);
      if (m) { counts[m[1]] = 1; return false; }

      m = reShip.exec(line);
      if (m) { counts[m[1]] = 1; return false; }

      m = reCount.exec(line);
      if (m) {
        if (!counts[m[1]]) { counts[m[1]] = 0; }
        counts[m[1]] += m[2];
        return false;
      }

      return true;

    }).sort();

    _.extend(counts, _.countBy(lines, function (line) { return line; }));

    return Promise.resolve(Object.keys(counts)).map(function (name) {
      // Grab a record for each type name, if possible.
      return MarketType.find({ regionID: regionID, typeName: name });
    }).filter(function (types) {
      // Discard any lines that didn't result in a type
      return types.length > 0 && types[0];
    }).map(function (types) {
      // Annotate each type with a count
      var type = types[0];
      type.count = counts[type.typeName];
      return type;
    }).then(function (result) {
      // HACK: Swap in packaged volumes where available.
      var byTypeID = _.indexBy(result, 'typeID');
      var typeIDs = _.keys(byTypeID);
      return eveData.dbEVE('invVolumes')
        .whereIn('typeID', typeIDs)
        .then(function (volumes) {
          volumes.forEach(function (volume) {
            if (byTypeID[volume.typeid]) {
              byTypeID[volume.typeid].volume = volume.volume;
            }
          });
          return result;
        });
    }).then(function (types) {
      // Calculate the totals for volume and prices.
      var totals = _.reduce(types, function (sum, type) {
        ['volume', 'sell', 'buy'].forEach(function (name) {
          sum[name] += type.count * type[name];
        });
        return sum;
      }, { volume: 0, sell: 0, buy: 0 });

      return {
        totals: totals,
        types: types
      };
    });

  };

  // TODO: Break this up into separate history, sell, buy calls - each with
  // their own updatedAts. In particular, history only needs updating daily.
  MarketType.prototype.fetchCRESTData = function (accessToken) {
    var $this = this;

    var now = Date.now();
    if ((now - this.updatedAt) < MAX_AGE) { return this; }

    var ordersBase = 'https://crest-tq.eveonline.com/market/' + this.regionID + '/orders/';
    var typeUrl = 'http://public-crest.eveonline.com/types/' + this.typeID + '/';

    return Promise.props({

      sell: request({
        url: ordersBase + 'sell/?type=' + typeUrl,
        method: 'GET', json: true, auth: { bearer: accessToken }
      }),

      buy: request({
        url: ordersBase + 'buy/?type=' + typeUrl,
        method: 'GET', json: true, auth: { bearer: accessToken }
      }),

      history: request({
        url: 'http://public-crest.eveonline.com/market/' + this.regionID +
          '/types/' + this.typeID + '/history/',
        method: 'GET', json: true
      }),

    }).then(function (results) {
      $this.history = results.history[1].items;
      $this.sellOrders = results.sell[1].items;
      $this.buyOrders = results.buy[1].items;
      return $this;
    });
  };

  MarketType.prototype.calculateSummaries = function () {
    var $this = this;

    return $this.lookupMarketGroupPath().then(function () {

      $this.history = _.sortByOrder($this.history, ['date'], [false]);

      var topBuy = _.sortBy($this.buyOrders, 'price').reverse()[0];
      if (topBuy) { $this.buy = topBuy.price; }

      var topSell = _.sortBy($this.sellOrders, 'price')[0];
      if (topSell) { $this.sell = topSell.price; }

      if ($this.buy && $this.sell) {
        $this.spread = $this.sell - $this.buy;
        $this.margin = ($this.spread / $this.buy) * 100.0;
      }

      $this.avgDailyVolume = $this.avgVolume();
      $this.avgDailyVolumeForWeek = $this.avgVolume(7);
      $this.avgDailyVolumeForMonth = $this.avgVolume(30);

      $this.volatility = $this.calcVolatility();
      $this.volatilityForMonth = $this.calcVolatility(7);
      $this.volatilityForWeek = $this.calcVolatility(30);

      return $this;
    });
  };

  MarketType.prototype.lookupMarketGroupPath = function () {
    var $this = this;
    if (this.marketGroupIDPath) {
      return Promise.resolve(true);
    }
    return eveData.invMarketGroupPath($this.marketGroupID).then(function (path) {
      $this.marketGroupIDPath = path;
      return $this;
    });
  };

  MarketType.prototype.avgVolume = function (range) {
    range = range || this.history.length;
    var sum = _.reduce(this.history.slice(0, range), function (sum, item) {
      return sum + item.volume;
    }, 0);
    return (sum) ? sum / range : 0;
  };

  MarketType.prototype.calcVolatility = function (range) {
    var rows = this.history;
    range = range || rows.length;
    var prices = _.pluck(rows.slice(0, range+1), 'avgPrice');
    var mean = _.reduce(prices, function (memo, price) {
      return memo + price;
    }, 0) / range;
    var avg_deviation = _.chain(prices).map(function (price) {
      return Math.pow(price - mean, 2);
    }).reduce(function (memo, price) {
      return memo + price;
    }, 0).value() / range;
    return (Math.sqrt(avg_deviation) / mean) * 100;
  };

  return MarketType;
};
