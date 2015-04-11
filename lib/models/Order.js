var eveData = require('../eveData');
var Promise = require('bluebird');

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
