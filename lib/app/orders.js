var _ = require('lodash');
var main = require(__dirname + '/..');
var Promise = require('bluebird');
var eveData = require('../eveData');
var models = require('../models');

module.exports = function (options, shared, app) {

  var orders = app.route('/orders');

  orders.get(function (req, res) {

    models.Order.find({
      orderState: 0
    }).then(function (orders) {

      var characterIDs = _.chain(orders).pluck('characterID').uniq().value();
      var stationIDs = _.chain(orders).pluck('stationID').uniq().value();

      return Promise.props({
        characters: models.Character.find({
          characterID: { $in: characterIDs }
        }).then(function (characters) {
          return _.indexBy(characters, 'characterID');
        }),
        stations: eveData.staStations({
          stationID: stationIDs
        }).then(function (stations) {
          return _.indexBy(stations, 'stationID');
        })
      }).then(function (result) {
        return orders.map(function (order) {
          var character = result.characters[order.characterID];
          var station = result.stations[order.stationID];
          order = order.toJSON();
          order.characterName = character.characterName;
          order.stationName = station.stationName;
          order.regionID = '' + station.regionID;
          return order;
        });
      });

    }).map(function (order) {

      return models.MarketType.find({
        regionID: order.regionID,
        typeID: order.typeID
      }).then(function (marketType) {

        order.market = marketType[0] || {};

        var marketOrders = order.bid ?
          order.market.buyOrders : order.market.sellOrders;

        var prices = _.chain(marketOrders)
          .filter(function (marketOrder) {
            return marketOrder.location.id == order.stationID;
          })
          .pluck('price')
          .sort(function (a, b) {
            return order.bid ? b-a : a-b;
          })
          .value();

        order.prices = parseFloat(prices);
        order.marketPrice = parseFloat(prices[0]);
        order.newPrice = order.marketPrice + (order.bid ? 0.01 : -0.01);

        return order;
      });

    }).then(function (orders) {

      var ordersByCharacter = _.chain(orders)
        .sortBy('typeName')
        .groupBy('characterName')
        .map(function (orders, characterName) {
          return [ characterName, _.groupBy(orders, 'bid') ]
        })
        .object().value();

      res.render('orders.html', {
        ordersJson: JSON.stringify(ordersByCharacter, null, ' '),
        ordersByCharacter: ordersByCharacter
      });

    });

  });

}
