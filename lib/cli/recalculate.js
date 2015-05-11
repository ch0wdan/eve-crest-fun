module.exports = function (program, init) {
  program.command('recalculate')
    .description('recalculate market type summaries')
    .action(init(cmd));
};

var Promise = require('bluebird');
var models = require('../models');

function cmd (args, options, shared) {
  var logger = shared.logger;

  Promise.all(models.MarketType.find().map(function (type) {
    return type.calculateSummaries()
      .then(function () { return type.save(); });
  })).then(function (types) {
    logger.info("Updated", types.length, "types");
  }).catch(function (err) {
    logger.error(err);
  }).finally(function () {
    return shared.done();
  });
}
