var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var eveData = require('../eveData');
var main = require(__dirname + '/..');
var models = require('../models');

var moment = require('moment');

module.exports = function (options, shared, app) {

  app.route('/appraisal')
    .get(function (req, res) {
      res.render('appraisal.html');
    })
    .post(function (req, res) {
      var regionID = 10000043;
      var paste = req.body.paste;

      var types, totals, err;
      models.MarketType.parsePaste(regionID, paste).then(function (result) {
        types = result.types;
        totals = result.totals;
      }).catch(function (result) {
        err = result;
      }).finally(function () {
        res.render('appraisal.html', {
          err: err,
          paste: paste,
          types: types,
          totals: totals
        });
      });
    });

  app.route('/margins')
    .get(function (req, res) {

      models.MarketType.find({
        regionID: 10000043,
        sell: { $gt: 1000000 },
        margin: { $gt: 15, $lt: 45 },
        volatilityForWeek: { $lt: 30 },
        avgDailyVolume: { $gt: 1 },
        updatedAt: { $gt: Date.now() - (4 * 60 * 60 * 1000) }
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

        var types_out = _.sortBy(types, 'margin').reverse().map(function (type) {
          type.updatedAt = new Date(type.updatedAt).toISOString();
          type.updatedAtLabel = moment(type.updatedAt).fromNow();
          return type;
        });

        res.render('margins.html', {
          types: types_out
        });

      });
    });

};
