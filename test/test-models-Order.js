var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var Promise = require('bluebird');
var expect = require('chai').expect;
var mockery = require('mockery');
var nodemock = require('nodemock');

var orders1Fn = __dirname + '/data/My Orders-2015.05.11 0212.txt';
var orders2Fn = __dirname + '/data/My Orders-2015.05.13 0026.txt';

describe('Order', function () {

  var models;
  var db = {};

  describe('.parseExportCSV', function () {

    it('should properly parse the CSV', function (done) {
      models.Order.parseExportCSV(orders1Fn).then(function (results) {
        results.forEach(function (result) {
          console.log(result._id);
        });
      }).catch(function (err) {
        console.error('err', err);
        throw err;
      }).finally(function () {
        done();
      });
    });

    it('should cancel existing orders not found in the CSV', function (done) {
      models.Order.parseExportCSV(orders1Fn).then(function (results) {
        results.forEach(function (result) {
          console.log(result._id);
        });
        return models.Order.parseExportCSV(orders2Fn)
      }).then(function (results) {
        results.forEach(function (result) {
          console.log(result._id);
        });
      }).catch(function (err) {
        console.error('err', err);
        throw err;
      }).finally(function () {
        done();
      });
    });

  });

  beforeEach(function (done) {
    db = {};

    var mockCollection = function (collectionName) {
      if (!db.hasOwnProperty(collectionName)) {
        db[collectionName] = {};
      }
      var collection = db[collectionName];
      return {
        update: function (query, data, opts, next) {
          collection[query._id] = data;
          return next(null, [data]);
        },
        remove: function (query, opts, next) {
          delete collection[query._id];
          return next(null, true);
        },
        findOne: function (query, next) {
          var obj = _.find(collection, query).first();
          if (next) { next(null, obj); }
          return obj;
        },
        find: function (query) {
          var objs = _(collection).values().filter(function (obj) {
            var match = true;
            ['characterID'].forEach(function (name) {
              var vals = _.get(query, name + '.$in', []);
              if (vals.indexOf(obj[name]) === -1) { match = false; }
            });
            return match;
          }).value();
          return {
            toArray: function (next) { next(null, objs); }
          }
        }
      };
    }

    mockery.registerMock('mongodb', {
      MongoClient: {
        connect: function (url, next) {
          next(null, { collection: mockCollection });
        }
      }
    });

    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
      useCleanCache: true
    });

    var main = require('../lib');
    main.initShared({}, done);

    models = require('../lib/models');
  });

  afterEach(function () {
    mockery.disable();
    mockery.deregisterAll();
  });

});
