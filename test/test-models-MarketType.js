var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var Promise = require('bluebird');

var expect = require('chai').expect;
var mockery = require('mockery');
var nodemock = require('nodemock');

var docs = require(__dirname + '/data/MarketTypes.json');
var fitEagle = fs.readFileSync(__dirname + '/data/fit-eagle.txt', 'utf8');
var fitScimitar = fs.readFileSync(__dirname + '/data/fit-scimitar.txt', 'utf8');
var assetPaste = fs.readFileSync(__dirname + '/data/assets-copy.txt', 'utf8');

var models = require('../lib/models');

describe('MarketType', function () {

  var regionID = 10000043;
  var volumes = { 11978: 10000, 12011: 10000 };

  var docsByTypeNameAndRegionID = _.indexBy(docs, function (object) {
    return object.typeName + ':' + object.regionID;
  });

  var docsByTypeIDAndRegionID = _.indexBy(docs, function (object) {
    return object.typeID + ':' + object.regionID;
  });

  var models = {
    db: {}
  };

  var baseClass = function () {
    var cls = function () {
      this.init.apply(this, arguments);
    };
    cls.get = function (id) {
      var key = id.typeID + ':' + id.regionID;
      return docsByTypeIDAndRegionID[key];
    };
    cls.find = function (query) {
      if (query.typeName && query.regionID) {
        var key = query.typeName + ':' + query.regionID;
        return Promise.resolve([docsByTypeNameAndRegionID[key]]);
      }
      if (query.typeID && query.regionID) {
        var key = query.typeID + ':' + query.regionID;
        return Promise.resolve([docsByTypeIDAndRegionID[key]]);
      }
      return Promise.resolve([]);
    };
    _.extend(cls.prototype, cls.__super__ = {
      init: function (attrs) {
        _.defaults(this, attrs || {}, cls.defaults);
      },
      getClass: function () { return cls; }
    });
    return cls;
  };

  var MarketType = require('../lib/models/MarketType')(models, baseClass);

  beforeEach(function (done) {

    mockery.registerMock('../lib/eveData', {
      dbEVE: function (tableName) {
        if (tableName === 'invVolumes') {
          return {
            whereIn: function (column, typeID) {
              if (column === 'typeID' && typeID in volumes) {
                return Promise.resolve([{
                  typeid: typeid, volume: volumes[typeID]
                }]);
              }
              return Promise.resolve([]);
            }
          };
        }
        return Promise.resolve([]);
      }
    });

    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
      useCleanCache: true
    });

    var main = require('../lib');
    main.initShared({}, done);

  });

  afterEach(function (done) {
    mockery.disable();
    mockery.deregisterAll();
    return done();
  });

  describe('.parsePaste()', function () {

    function testResult (result, expectedCounts) {
      var types = result.types;

      var typesCounts = {};
      types.forEach(function (type) {
        typesCounts[type.typeName] = type.count;
      });
      expect(typesCounts).to.deep.equal(expectedCounts);

      var buyOrderTotal = _.reduce(types, function (sum, type) {
        return sum + (type.count * type.buy);
      }, 0);
      var sellOrderTotal = _.reduce(types, function (sum, type) {
        return sum + (type.count * type.sell);
      }, 0);
    }

    it('should parse the asset copypasta', function (done) {

      MarketType.parsePaste(regionID, assetPaste).then(function (result) {
        // console.log(JSON.stringify(result, null, '  '));
        return done();
      });

    });

    it('should parse the Scimitar fitting', function (done) {

      var expectedCounts = {
        "Scimitar": 1,
        "Damage Control II": 1,
        "Power Diagnostic System II": 1,
        "Capacitor Power Relay II": 2,
        "Adaptive Invulnerability Field II": 2,
        "Large Shield Extender II": 2,
        "10MN Afterburner II": 1,
        "Large S95a Remote Shield Booster": 3,
        "Medium Ancillary Current Router I": 1,
        "Medium Anti-Kinetic Screen Reinforcer II": 1,
        "Acolyte II": 5,
        "Light Armor Maintenance Bot I": 4,
        "Nanite Repair Paste": 50
      };

      MarketType.parsePaste(regionID, fitScimitar).then(function (result) {
        testResult(result, expectedCounts);
        return done();
      });

    });

    it('should parse the Eagle fitting', function (done) {

      var expectedCounts = {
        "Eagle": 1,
        "Damage Control II": 1,
        "Power Diagnostic System II": 1,
        "Magnetic Field Stabilizer II": 2,
        "Large Shield Extender II": 2,
        "Adaptive Invulnerability Field II": 2,
        "10MN Afterburner II": 1,
        "EM Ward Field II": 1,
        "250mm Railgun II": 5,
        "Medium Core Defense Field Extender I": 2,
        "Antimatter Charge M": 5000,
        "Spike M": 3000,
        "Caldari Navy Antimatter Charge M": 3000,
        "Caldari Navy Thorium Charge M": 3000,
        "Nanite Repair Paste": 100
      };

      MarketType.parsePaste(regionID, fitEagle).then(function (result) {
        testResult(result, expectedCounts);
        return done();
      });

    });

  });

});
