var eveData = require('../eveData');
var Promise = require('bluebird');

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var csv = require('csv');

module.exports = function (models, baseClass) {
  var Order = baseClass();

  Order.collection = 'Orders';

  Order.defaults = {
    characterID: null,
    orderID: null,
    charID: null,
    stationID: null,
    volEntered: null,
    volRemaining: null,
    minVolume: null,
    orderState: null,
    typeID: null,
    typeName: null,
    range: null,
    accountKey: null,
    duration: null,
    escrow: null,
    price: null,
    bid: null,
    issued: null
  };

  Order.id = function (obj) {
    return obj.orderID;
  };

  Order.parseExportCSV = function (filepath) {

    return new Promise(function (resolve, reject) {

      var orders = [];
      var parser = csv.parse({columns: true}, function (err, data) {
        orders = orders.concat(data);
      });

      fs.createReadStream(filepath)
        .pipe(parser)
        .on('end', function () { resolve(orders); })
        .on('error', function (err) { reject(err); });

    }).map(function (row) {

      return eveData.invTypes({ typeID: row.typeID })
        .then(function (types) {
          row.typeName = types[0].typeName;
          var obj = new models.Order(row);
          return obj.save();
        });

    }).then(function (orders) {
      console.log(orders);
      return orders;
    });

  };

  Order.clean = function (row) {
    var aliasMap = {
      charID: 'characterID',
      issueDate: 'issued'
    };
    var idFields = [
      'orderID', 'typeID', 'accountID', 'charID', 'characterID', 'charID',
      'regionID', 'stationID', 'solarSystemID', 'accountKey'
    ];
    var intFields = [
      'minVolume', 'orderState', 'volEntered', 'volRemaining', 'range'
    ];
    var floatFields = ['price', 'duration', 'escrow'];
    var boolFields = ['bid'];

    return _.chain(row).map(function (value, name) {
      if ('' === name) { return; }
      var alias = aliasMap[name];
      if (alias && !_.has(row, alias)) { name = alias; }
      if (_.includes(idFields, name)) { value = '' + value; }
      if (_.includes(intFields, name)) { value = parseInt(value); }
      if (_.includes(floatFields, name)) { value = parseFloat(value); }
      if (_.includes(boolFields, name)) {
        if ('True' === value) { value = true; }
        else if ('False' === value) { value = false; }
        else { value = !!value; }
      }
      return [name, value];
    }).object().value();
  };

  Order.prototype.save = function () {
    var $this = this;

    var next = ($this.typeName) ? Promise.resolve(true) :
      eveData.invTypes({ typeID: $this.typeID }).then(function (types) {
        if (types.length) { $this.typeName = types[0].typeName; }
        return $this;
      });

    next.then(function () { return Order.__super__.save.apply($this); });
  };

  return Order;
};
