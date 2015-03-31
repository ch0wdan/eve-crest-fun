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
