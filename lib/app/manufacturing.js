var _ = require('lodash');
var main = require(__dirname + '/..');
var Promise = require('bluebird');
var eveData = require('../eveData');
var models = require('../models');

module.exports = function (options, shared, app) {

  var manufacturingApp = app.route('/manufacturing');

  manufacturingApp.get(function (req, res) {

    var blueprints, typeIDs, prices, character;

    models.Blueprint.find().then(function (result) {

      blueprints = result;
      typeIDs = _(blueprints).invoke('getTypes').flatten().uniq().value();

      return new Promise(function (resolve, reject) {
        models.db.collection(models.MarketType.collection).find({
          // regionID: models.MarketType.JITA_REGION_ID
          regionID: '10000043' // Domain - Amarr
        }, {
          typeID: 1, sell: 1, buy: 1
        }).toArray(function (err, docs) {
          resolve(_.indexBy(docs, 'typeID'));
        });
      });

    }).then(function (result) {

      prices = result;
      return models.Character.findOne({ characterName: 'Pham Vrinimi' });

    }).then(function (result) {

      character = result;
      return blueprints;

    }).map(function (blueprint) {

      return blueprint.calculatePrices(prices);

    }).then(function () {

      blueprints = _(blueprints)
        .map(function (blueprint) {
          _.each(blueprint.activities, function (props, name) {
            props.hasSkills = blueprint.checkSkills(name, character);
          });
          return blueprint;
        })
        .filter(function (blueprint) {

          if (!blueprint.activities.manufacturing) { return false; }
          if (!blueprint.activities.manufacturing.hasSkills) { return false; }

          var perc = blueprint.activities.manufacturing.priceMarginPercent;
          var margin = blueprint.activities.manufacturing.priceMargin;
          return (perc > 0) && (perc < 70) &&
                 (margin > 100000);

        })
        .sort(function (a, b) {
          return b.activities.manufacturing.priceMarginPercent -
                 a.activities.manufacturing.priceMarginPercent;
        })
        .value();

      res.render('manufacturing.html', {
        blueprints: blueprints
      });

    });

  });

}
