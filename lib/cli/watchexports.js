module.exports = function (program, init) {
  program.command('watchexports')
    .description('watch for and process market exports')
    .action(init(cmd));
};

var Promise = require('bluebird');
var models = require('../models');
var _ = require('lodash');
var os = require('os');
var fs = require('fs');
var path = require('path');

function cmd (args, options, shared) {
  var LOGS_PATH = getUserHome() + '/Documents/EVE/logs/Marketlogs';

  var logger = shared.logger;

  var handleMarketExport = _.debounce(function (filepath) {
    models.MarketType.parseExportCSV(filepath).then(function (types) {
      _.each(types, function (type) {
        logger.debug("Updated", type.typeName, type.typeID, type.regionID);
      });
      logger.info("Updated", types.length, "types");
    });
  }, 300);

  var handleOrdersExport = _.debounce(function (filepath) {
    models.Order.parseExportCSV(filepath).then(function (orders) {
      logger.info("Updated", orders.length, "orders");
    });
  }, 300);

  fs.watch(LOGS_PATH, function (event, filename) {
    if ('change' == event) {
      var filepath = path.join(LOGS_PATH, filename);
      if (filename.indexOf('My Orders') === 0) {
        handleOrdersExport(filepath);
      } else {
        handleMarketExport(filepath);
      }
    }
  });

}

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
