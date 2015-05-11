var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var eveData = require('../eveData');
var main = require(__dirname + '/..');
var models = require('../models');

var moment = require('moment');

module.exports = function (options, shared, app) {

  app.route('/margins')
    .get(function (req, res) {

      models.MarketType.find({
        regionID: 10000043,
        sell: { $gt: 10000 },
        margin: { $gt: 7, $lt: 35 },
        volatilityForWeek: { $lt: 25 },
        avgDailyVolume: { $gt: 1 },
        spread: { $gt: 0 },
        updatedAt: { $gt: Date.now() - (3 * 60 * 60 * 1000) }
      }).then(function (types) {
        var typeIDs = _.pluck(types, 'typeID');
        return Promise.all([
          types,
          models.MarketType.find({
            regionID: 10000002,
            typeID: { $in: typeIDs }
          })
        ])
      }).spread(function (types, jitaTypes) {
        var idMap = _.indexBy(jitaTypes, 'typeID');
        return types.map(function (type) {
          type.jita = idMap[type.typeID];
          return type;
        });
      }).then(function (types) {

        var types_out = _.chain(types)
          .map(function (type) {
            type.updatedAt = new Date(type.updatedAt).toISOString();
            type.updatedAtLabel = moment(type.updatedAt).fromNow();
            type.score = (type.spread * type.avgDailyVolumeForWeek) / type.volatilityForWeek;
            return type;
          })
          .sortBy('score')
          .reverse()
          .value();

        res.render('margins.html', {
          types: types_out
        });

      });
    });

};

