var eveData = require('../eveData');
var Promise = require('bluebird');

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var csv = require('csv');

module.exports = function (models, baseClass) {
  var Order = baseClass();

  Order.collection = 'Orders';

  Order.fields = {
    characterID: {},
    orderID: {},
    charID: {},
    stationID: {},
    typeID: {},
    typeName: {},
    accountKey: {},
    volEntered: { type: models.INTEGER },
    volRemaining: { type: models.INTEGER },
    minVolume: { type: models.INTEGER },
    orderState: { type: models.INTEGER },
    range: { type: models.INTEGER },
    duration: { type: models.FLOAT },
    escrow: { type: models.FLOAT },
    price: { type: models.FLOAT },
    bid: { type: models.BOOLEAN },
    issued: { type: models.DATE }
  };

  Order.fieldAliases = {
    charID: 'characterID',
    issueDate: 'issued'
  };

  Order.id = function (obj) {
    return obj.orderID;
  };

  Order.parseExportCSV = function (filepath) {

    var existingOrders = {};

    return new Promise(function (resolve, reject) {

      var orders = [];
      var parser = csv.parse({columns: true}, function (err, data) {
        orders = orders.concat(data);
      });

      fs.createReadStream(filepath)
        .pipe(parser)
        .on('end', function () { resolve(orders); })
        .on('error', function (err) { reject(err); });

    }).then(function (rows) {

      return models.Order.find({
        characterID: { $in: _(rows).pluck('charID').uniq().value() }
      }).then(function (orders) {
        existingOrders = _.indexBy(orders, 'orderID');
        return rows;
      });

    }).map(function (row) {

      return eveData.invTypes({
        typeID: row.typeID
      }).then(function (types) {
        row.typeName = types[0].typeName;
        var obj = new models.Order(row);
        delete existingOrders[obj.orderID];
        return obj.save();
      });

    }).then(function (orders) {

      return Promise.all(_.values(existingOrders).map(function (order) {
        return order.destroy();
      })).then(function () {
        return orders;
      });

    });

  };

  Order.prototype.save = function () {
    var $this = this;

    var next = ($this.typeName) ? Promise.resolve(true) :
      eveData.invTypes({ typeID: $this.typeID }).then(function (types) {
        if (types.length) { $this.typeName = types[0].typeName; }
        return $this;
      });

    return next.then(function () {
      return Order.__super__.save.apply($this);
    });
  };

  return Order;
};
