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
            console.log(order);

      return models.MarketType.findOne({
        regionID: order.regionID,
        typeID: order.typeID
      }).then(function (marketType) {
        order.market = marketType;
        if (order.market) {
          var stationOrders = order.market.filterOrdersByStation(order.stationID);
          var byBid = stationOrders[order.bid ? 'buyOrders' : 'sellOrders'];
          if (order.typeID == '31796') {
            console.log(order.bid, order.bid ? 'buyOrders' : 'sellOrders');
            console.log(order.market[order.bid ? 'buyOrders' : 'sellOrders']);
          }
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
        .map(function (orders, characterName) {
          return [
            characterName,
            _.chain(orders)
              .groupBy('stationName')
              .map(function (stationOrders, stationID) {
                return [stationID, _.groupBy(stationOrders, 'bid')];
              })
              .value()
          ];
        })
        .object().value();

      res.render('orders.html', {
        ordersJson: JSON.stringify(ordersByCharacter, null, ' '),
        ordersByCharacter: ordersByCharacter
      });

    });

  });

}
