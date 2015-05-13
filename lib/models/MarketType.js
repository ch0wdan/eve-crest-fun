var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var csv = require('csv');
var Promise = require('bluebird');
var eveData = require('../eveData');
var requestOrig = require('request');
// requestOrig.debug = true;
var request = Promise.promisify(requestOrig);

var main = require(__dirname + '/..');

var MAX_AGE = 10 * 60 * 1000;

module.exports = function (models, baseClass) {
  var MarketType = baseClass();

  MarketType.JITA_STATION_NAME = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
  MarketType.JITA_STATION_ID = '60003760';
  MarketType.JITA_REGION_ID = '10000002';

  MarketType.collection = 'MarketTypes';

  MarketType.fields = {
    regionID: { type: models.STRING },
    typeID: { type: models.STRING },
    typeName: { type: models.STRING },
    volume: {},
    marketGroupID: { type: models.STRING },
    marketGroupIDPath: {},
    groupID: { type: models.STRING },
    history: {},
    sellOrders: {},
    buyOrders: {},
    buy: {},
    sell: {},
    spread: {},
    margin: {},
    avgDailyVolume: {},
    avgDailyVolumeForWeek: {},
    avgDailyVolumeForMonth: {},
    volatility: {},
    volatilityForMonth: {},
    volatilityForWeek: {},
    updatedAt: {}
  };

  MarketType.id = function (obj) {
    return obj.typeID + ':' + obj.regionID;
  };

  var baseClean = MarketType.clean;
  MarketType.clean = function (data) {
    var out = baseClean(data);

    // Ensure all elements of the path are strings.
    if (out.marketGroupIDPath) {
      out.marketGroupIDPath = out.marketGroupIDPath.map(function (id) {
        return '' + id;
      });
    }

    // Ensure every order has a CREST-style location.id
    ['sellOrders', 'buyOrders'].forEach(function (key) {
      if (!out[key]) { return; }
      out[key] = out[key].map(function (row) {
        if (!row.location) {
          row.location = { id: row.stationId };
        }
        return row;
      });
    });

    return out;
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

  MarketType.parseExportCSV = function (filepath) {

    return new Promise(function (resolve, reject) {

      var orders = [];
      var parser = csv.parse({columns: true}, function (err, data) {
        orders = orders.concat(data);
      });

      fs.createReadStream(filepath)
        .pipe(parser)
        .on('end', function () { resolve(orders); })
        .on('error', function (err) { reject(err); });

    }).then(function (orders) {

      var typeIDs = _.chain(orders).pluck('typeID').uniq().value();
      var regionIDs = _.chain(orders).pluck('regionID').uniq().value();
      var stationIDs = _.chain(orders).pluck('stationID').uniq().value();

      return Promise.props({
        orders: orders,
        types: eveData.invTypes({ typeID: typeIDs }),
        regions: eveData.mapRegions({ regionID: regionIDs }),
        stations: eveData.staStations({ stationID: stationIDs })
      });

    }).then(function (result) {

      var types = _.indexBy(result.types, 'typeID');
      var regions = _.indexBy(result.regions, 'regionID');
      var stations = _.indexBy(result.stations, 'stationID');

      var ordersByRegionAndType = _.chain(result.orders)
        .groupBy(function (order) {
          return order.regionID + ':' + order.typeID;
        })
        .value();

      return Promise.all(_.map(ordersByRegionAndType, function (orders, key) {

        var parts = key.split(':');
        var regionID = parts[0];
        var typeID = parts[1];
        var type = types[typeID];

        var ordersByBid = _.chain(orders).map(function (order) {
          var station = stations[order.stationID];
          order.location = {
            id: order.stationID,
            name: station ? station.stationName : ''
          };
          order.bid = order.bid == 'True' ? true :
                      order.bid == 'False' ? false :
                      !!order.bid;
          return order;
        }).groupBy('bid').value();

        return models.MarketType.get({
          typeID: typeID,
          regionID: regionID
        }).then(function (obj) {
          if (!obj) {
            type.regionID = parseInt(regionID);
            obj = new models.MarketType(type);
          }
          obj.sellOrders = ordersByBid[false] || [];
          obj.buyOrders = ordersByBid[true] || [];
          return obj;
        }).then(function (obj) {
          return obj.calculateSummaries();
        }).then(function (obj) {
          return obj.save();
        });

      }));

    });

  };

  MarketType.prototype.filterOrdersByStation = function (stationID) {
    var $this = this;
    var out = {};
    ['sellOrders', 'buyOrders'].forEach(function (key) {
      out[key] = _.chain($this[key]).filter(function (order) {
        return ''+stationID == ''+order.location.id;
      }).sort(function (a, b) {
        return (key == 'buyOrders') ?
          b.price - a.price : a.price - b.price;
      }).value();
    });
    return out;
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

      if ($this.buyOrders.length > 0) {
        $this.buy = _.chain($this.buyOrders)
          .sort(function (a, b) { return b.price - a.price; })
          .first().value().price;
      }

      if ($this.sellOrders.length > 0) {
        $this.sell = _.chain($this.sellOrders)
          .sort(function (a, b) { return a.price - b.price; })
          .first().value().price;
      }

      // TODO: calculate buy / sell of top 5% orders

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
