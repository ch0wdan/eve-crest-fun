var models = require('../models');

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

};
