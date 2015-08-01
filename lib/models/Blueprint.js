var _ = require('lodash');
var Promise = require('bluebird');
var eveData = require('../eveData');

module.exports = function (models, baseClass) {
  var Blueprint = baseClass();

  Blueprint.collection = 'Blueprints';

  Blueprint.fields = {
    blueprintTypeID: {},
    blueprintTypeName: {},
    activities: {},
    maxProductionLimit: {}
  };

  Blueprint.id = function (obj) {
    return obj.blueprintTypeID;
  };

  Blueprint.TYPE_ID_PATHS = [
    'activities.copying.materials',
    'activities.copying.skills',
    'activities.invention.materials',
    'activities.invention.products',
    'activities.invention.skills',
    'activities.manufacturing.materials',
    'activities.manufacturing.products',
    'activities.manufacturing.skills',
    'activities.research_material.materials',
    'activities.research_material.skills',
    'activities.research_time.materials',
    'activities.research_time.skills'
  ];

  Blueprint.prototype.getTypeIDs = function () {
    var $this = this;
    var typeIDs = [this.blueprintTypeID];
    Blueprint.TYPE_ID_PATHS.forEach(function (path) {
      var typeList = _.get($this, path, []);
      typeIDs = typeIDs.concat(_.pluck(typeList, 'typeID'));
    });
    return _.uniq(typeIDs);
  };

  Blueprint.prototype.getTypes = function () {
    return eveData.invTypes({ typeID: this.getTypeIDs() })
      .then(function (types) {
        return _.indexBy(types, 'typeID');
      });
  };

  Blueprint.prototype.denormalize = function () {
    var $this = this;

    return this.getTypes().then(function (types) {

      $this.blueprintTypeName =
        _.get(types, $this.blueprintTypeID + '.typeName', '');

      Blueprint.TYPE_ID_PATHS.forEach(function (path) {
        var typeList = _.get($this, path, []);
        typeList.forEach(function (type) {
          type.typeName = _.get(types, type.typeID + '.typeName', '');
        });
      });

      return $this;
    })
  };

  Blueprint.prototype.calculatePrices = function (prices) {
    var $this = this;

    Blueprint.TYPE_ID_PATHS.forEach(function (path) {

      var materials = _.get($this, path, []);
      if (materials.length === 0) { return; }

      var total = 0;
      var buySell = (path.indexOf('.products') === -1) ? '.buy' : '.sell';

      materials.forEach(function (material) {
        var price = _.get(prices, material.typeID + buySell, 0);
        material.price = material.quantity * price;
        total += material.price;
      });

      _.set($this, path + 'TotalPrice', total);

    });

    if ('manufacturing' in this.activities) {
      var buildPrice =
        _.get(this, 'activities.manufacturing.materialsTotalPrice', 0);
      var sellPrice =
        _.get(this, 'activities.manufacturing.productsTotalPrice', 0);

      this.activities.manufacturing.priceMargin = sellPrice - buildPrice;
      this.activities.manufacturing.priceMarginPercent =
        ((sellPrice - buildPrice) / buildPrice) * 100;
    }

    return $this;
  };

  Blueprint.prototype.checkSkills = function (activity, character) {
    var skills = _.get(this, 'activities.' + activity + '.skills', []);

    if (skills.length === 0) { return true; }

    var ok = true;
    skills.forEach(function (skill) {
      var trainedLevel = _.get(character, 'skills.' + skill.typeID, 0);
      if (trainedLevel > 0) {
        console.log(skill.typeName, trainedLevel, skill.level, trainedLevel < skill.level);
      }
      if (trainedLevel < skill.level) { ok = false; }
    });

    return ok;
  };

  return Blueprint;
};
