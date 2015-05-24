var _ = require('lodash');
var main = require(__dirname + '/..');
var Promise = require('bluebird');
var eveData = require('../eveData');
var models = require('../models');

module.exports = function (options, shared, app) {

  var ordersRoute = app.route('/orders');

  ordersRoute.get(function (req, res) {

    models.Order.find({
      orderState: 0
    }).then(function (orders) {

      var characterIDs = _.chain(orders).pluck('characterID').uniq().value();
      var stationIDs = _.chain(orders).pluck('stationID').uniq().value();
      var typeIDs = _.chain(orders).pluck('typeID').uniq().value();

      return Promise.props({
        orders: orders,
        characters: models.Character.find({
          characterID: { $in: characterIDs }
        }).then(function (characters) {
          return _.indexBy(characters, 'characterID');
        }),
        stations: eveData.staStations({
          stationID: stationIDs
        }).then(function (stations) {
          return _.indexBy(stations, 'stationID');
        }),
        transactions: models.Transaction.find({
          characterID: { $in: characterIDs },
          typeID: { $in: typeIDs }
        }).then(function (transactions) {
          return _.groupBy(transactions, 'typeID');
        })
      });

    }).then(function (result) {

      return result.orders.map(function (order) {

        var character = result.characters[order.characterID];
        var station = result.stations[order.stationID];
        var transactions = result.transactions[order.typeID];

        order = order.toJSON();
        order.characterName = character.characterName;
        order.stationName = station.stationName;
        order.regionID = '' + station.regionID;

        order.transactionsPrice = 0;
        if (transactions) {
          var byType = _.groupBy(transactions, 'transactionType');
          order.transactions = byType;
          var opposite = byType[order.bid ? 'sell' : 'buy'];
          if (opposite) {
            var prices = _(opposite).pluck('price').map(parseFloat).value();
            order.oppositePrice = parseInt(_.reduce(prices, function (m, n) {
              return m + n
            }, 0) / prices.length * 100) / 100;
          }
        }

        return order;
      });

    }).map(function (order) {

      return models.MarketType.findOne({
        regionID: order.regionID,
        typeID: order.typeID
      }).then(function (marketType) {
        order.market = marketType;
        if (order.market) {
          var stationOrders = order.market.filterOrdersByStation(order.stationID);
          var byBid = stationOrders[order.bid ? 'buyOrders' : 'sellOrders'];
          if (byBid && byBid.length) {
            order.marketPrice = byBid[0].price;
            order.newPrice = (parseInt(order.marketPrice * 100) + (order.bid ? 1 : -1)) / 100;
          }
        }
        return order;
      });

    }).then(function (orders) {

      var ordersByCharacter = _.chain(orders)
        .sortBy('typeName')
        .groupBy('characterName')
        .map(function (characterOrders, characterName) {
          var byStationAndBid = _.chain(characterOrders)
            .groupBy('stationName')
            .map(function (stationOrders, stationID) {
              return [stationID, _.groupBy(stationOrders, 'bid')];
            }).value();
          return [ characterName, byStationAndBid ];
        }).value();

      res.render('orders.html', {
        ordersJson: JSON.stringify(ordersByCharacter, null, ' '),
        ordersByCharacter: ordersByCharacter
      });

    });

  });

}
