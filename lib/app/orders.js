var _ = require('lodash');
var main = require(__dirname + '/..');
var Promise = require('bluebird');
var eveData = require('../eveData');
var models = require('../models');

module.exports = function (options, shared, app) {

  var orders = app.route('/orders');

  orders.get(function (req, res) {

    models.Order.find({
      orderState: '0'
    }).then(function (orders) {

      return Promise.props({
        characters: Promise.props(
          _.chain(orders).pluck('characterID').uniq().map(function (characterID) {
            return [ characterID, models.Character.find({ characterID: characterID }) ];
          }).object().value()
        ),
        stations: Promise.props(
          _.chain(orders).pluck('stationID').uniq().map(function (stationID) {
            return [ stationID, eveData.staStations({ stationID: stationID }) ];
          }).object().value()
        )
      }).then(function (result) {
        return orders.map(function (order) {
          var character = result.characters[order.characterID][0];
          var station = result.stations[order.stationID][0];
          order = order.toJSON();
          order.characterName = character.characterName;
          order.stationName = station.stationName;
          order.regionID = station.regionID;
          return order;
        });
      });

    }).map(function (order) {

      return models.MarketType.find({
        regionID: parseInt(order.regionID),
        typeID: parseInt(order.typeID)
      }).then(function (marketType) {

        order.market = marketType[0] || {};

        var marketOrders = (order.bid === '1') ?
          order.market.buyOrders : order.market.sellOrders;

        var prices = _.chain(marketOrders)
          .filter(function (marketOrder) {
            return marketOrder.location.id == order.stationID;
          })
          .pluck('price')
          .sort(function (a, b) {
            return (order.bid === '1') ? b-a : a-b;
          })
          .value();

        order.prices = prices;
        order.marketPrice = prices[0];

        if ('EM Ward Field II' == order.typeName) {
          console.log(marketType, order);
        }

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
