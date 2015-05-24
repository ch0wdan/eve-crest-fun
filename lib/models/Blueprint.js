var _ = require('lodash');
var eveData = require('../eveData');

module.exports = function (models, baseClass) {
  var Blueprint = baseClass();

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

  Blueprint.prototype.denormalize = function () {
    var $this = this;

    var typeIDs = [this.blueprintTypeID];
    Blueprint.TYPE_ID_PATHS.forEach(function (path) {
      var typeList = _.get($this, path, []);
      typeIDs = typeIDs.concat(_.pluck(typeList, 'typeID'));
    });
    typeIDs = _.uniq(typeIDs);

    return eveData.invTypes({ typeID: typeIDs }).then(function (types) {

      var types = _.indexBy(types, 'typeID');

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

  return Blueprint;
};
