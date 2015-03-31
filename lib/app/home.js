var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var eveData = require('../eveData');
var main = require(__dirname + '/..');
var models = require('../models');

module.exports = function (options, shared, app) {

  app.route('/')
    .get(function (req, res) {

      models.MarketType.find({
        regionID: 10000043,
        sell: { $gt: 100000 },
        margin: { $gt: 20, $lt: 40 },
        volatilityForWeek: { $lt: 15 },
        avgDailyVolume: { $gt: 10 }
      }).then(function (types) {

        res.render('index.html', {
          hello: 'world',
          types: _.sortBy(types, 'margin').reverse()
        });
      });
    });

};
