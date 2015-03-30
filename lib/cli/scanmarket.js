module.exports = function (program, init) {
  program.command('scanmarket')
    .description('scan market for orders and history')
    .option('-r, --regions <name,name,name>', 'regional market for scan', list)
    .option('-g, --groups <id,id,...,id>', 'market group for items', list)
    .action(init(cmd));
};

function list (val) {
  return val.split(/,/g);
}

var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var request = Promise.promisify(require('request'));

var eveData = require('../eveData');
var main = require(__dirname + '/..');
var models = require('../models');

function cmd (args, options, shared) {
  var logger = shared.logger;
  var db = shared.db;

  var regions, marketGroups, types, typesTotal, typesProcessed, refreshToken,
      accessToken, character, startedAt;

  eveData.mapRegions({ regionName: options.regions }).then(function (result) {

    regions = _.pluck(result, 'regionID');
    logger.debug("Scanning " + regions.length + " regions");
    return eveData.invMarketGroups({ shallow: true });

  }).then(function (result) {

    marketGroups = _.chain(result).filter(function (group, groupID) {
      return options.groups.indexOf(group.marketGroupName) !== -1;
    }).map(function (group) {
      return group.marketGroupID;
    }).value();
    return main.authorizeCrest(shared.config);

  }).then(function (result) {

    refreshToken = result.refresh_token;
    accessToken = result.access_token;
    return main.whoami(accessToken);

  }).then(function (result) {

    character = result;
    logger.debug('Authenticated as ' + character.CharacterName +
                 ' (' + character.CharacterID + ')');
    return eveData.invTypes({ marketGroupID: marketGroups });

  }).then(function (result) {

    types = result;
    typesTotal = types.length;
    typesProcessed = 0;

    logger.debug("Scanning " + typesTotal + " types");

    startedAt = Date.now();

    return types;

  }).map(function (type) {

    return Promise.all(regions.map(function (regionID) {

      return models.MarketType.get({
        typeID: type.typeID,
        regionID: regionID
      }).then(function (obj) {
        if (!obj) {
          type.regionID = regionID;
          obj = new models.MarketType(type);
        }
        return obj.fetchCRESTData(accessToken);
      }).then(function (obj) {
        return obj.calculateSummaries();
      }).then(function (obj) {
        return obj.save();
      });

    })).then(function (results) {
      typesProcessed++;

      var duration = Date.now() - startedAt;
      var perType = duration / typesProcessed;
      var expectedDuration = typesTotal * perType;
      var remainingDuration = expectedDuration - duration;

      console.log([
        parseInt(( typesProcessed / typesTotal ) * 100),
        '% (', typesProcessed, ' / ', typesTotal, ')',
        ' ', parseInt(remainingDuration / 1000 / 60), ' / ',
             parseInt(expectedDuration / 1000 / 60),' min est'
      ].join(''));

      return results;
    });

  }, { concurrency: 1 }).catch(function (err) {
    logger.error(err);
  }).finally(function (result) {
    return shared.done();
  });

}
