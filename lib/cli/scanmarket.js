module.exports = function (program, init) {
  program.command('scanmarket')
    .description('scan market for orders and history')
    .option('-r, --regions <name,name,name>', 'regional market for scan', list)
    .option('-g, --groups <id,id,...,id>', 'market group for items', list)
    .option('-O, --orders', 'use regions and types found in orders')
    .option('-C, --concurrency', 'CREST fetch concurrency (default: 4)')
    .action(init(cmd));
};

function list (val) {
  return val.split(/,/g);
}

var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var request = Promise.promisify(require('request'));

var main = require(__dirname + '/..');
var eveData = require('../eveData');
var models = require('../models');

var DEFAULT_CONCURRENCY = 4;

var DEFAULT_GROUPS = [
  'Ships', 'Ship Equipment', 'Ammunition & Charges', 'Drones',
  'Ship Modifications'
];

function cmd (args, options, shared) {
  var logger = shared.logger;
  var db = shared.db;

  var concurrency = options.concurrency || DEFAULT_CONCURRENCY;

  var regions, marketGroups, types, typesTotal, typesProcessed, refreshToken,
      accessToken, character, startedAt;

  main.authorizeCrest(shared.config).then(function (result) {

    refreshToken = result.refresh_token;
    accessToken = result.access_token;
    return main.whoami(accessToken);

  }).then(function (result) {

    character = result;
    logger.debug('Authenticated as ' + character.CharacterName +
                 ' (' + character.CharacterID + ')');

    if (options.orders) {
      return fetchRegionsAndTypesViaOrders();
    } else {
      return fetchRegionsAndTypesViaOptions(options);
    }

  }).then(function (result) {

    startedAt = Date.now();

    regions = result.regions;
    types = result.types;
    typesTotal = types.length;
    typesProcessed = 0;

    logger.debug("Scanning " + regions.length + " regions");
    logger.debug("Scanning " + typesTotal + " types");

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

  }, { concurrency: concurrency }).catch(function (err) {
    logger.error(err);
  }).finally(function (result) {
    return shared.done();
  });

}

function fetchRegionsAndTypesViaOptions (options) {

  if (!options.groups || options.groups.length === 0) {
    options.groups = DEFAULT_GROUPS;
  }

  return eveData.invMarketGroups({ shallow: true }).then(function (result) {

    var marketGroups = _.chain(result).filter(function (group, groupID) {
      if (!options.groups) { return true; }
      return options.groups.indexOf(group.marketGroupName) !== -1;
    }).map(function (group) {
      return group.marketGroupID;
    }).value();

    return Promise.props({
      types: eveData.invTypes({ marketGroupID: marketGroups }),
      regions: eveData.mapRegions({ regionName: options.regions })
    });

  });
}

function fetchRegionsAndTypesViaOrders (options) {
  return models.Order.find({ orderState: 0 }).then(function (orders) {

    var stationIDs = _.chain(orders).pluck('stationID').uniq().value();
    var typeIDs = _.chain(orders).pluck('typeID').uniq().value();

    return Promise.props({
      types: eveData.invTypes({ typeID: typeIDs }),
      regions: eveData.lookupRegions({ stationID: stationIDs })
    });

  });
}
