var crypto = require('crypto');
var util = require('util');
var events = require('events');
var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var requireDir = require('require-dir');

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Collection = mongodb.Collection;

var models = module.exports = {};

models.db = null;

models.initDatabase = function (config, next) {
  MongoClient.connect(config.mongodbUrl, function (err, db) {
    models.db = db;
    return next(err, db);
  });
};

models.md5 = function md5 (/*...*/) {
  var hash = crypto.createHash('md5');
  for (var i=0; i<arguments.length; i++) {
    hash.update('' + arguments[i]);
  }
  return hash.digest('hex');
}

var baseClass = function () {

  var cls = function () {
    this.init.apply(this, arguments);
  };

  cls.defaults = {};

  cls.id = function (obj) {
    return models.md5(JSON.stringify(obj));
  };

  cls.getOrCreate = function (keyObj) {
    return cls.get(keyObj).then(function (obj) {
      if (obj) { return obj; }
      return new cls(keyObj);
    });
  };

  cls.get = function (id) {
    return new Promise(function (resolve, reject) {
      if (_.isObject(id)) {
        id = cls.id(id);
      }
      var coll = models.db.collection(cls.collection);
      coll.findOne({ _id: id }, function (err, data) {
        return (err) ?  reject(err) : resolve((data) ? new cls(data) : null);
      });
    });
  };

  cls.find = function (query) {
    return new Promise(function (resolve, reject) {
      var coll = models.db.collection(cls.collection);
      coll.find(query).toArray(function (err, docs) {
        if (err) { return reject(err); }
        return resolve(docs.map(function (doc) {
          return new cls(doc);
        }));
      });
    });
  };

  _.extend(cls.prototype, cls.__super__ = {

    init: function (attrs) {
      _.defaults(this, attrs || {}, cls.defaults);
      if (!this._id) {
        this._id = cls.id(this);
      }
    },

    getClass: function () { return cls; },

    toJSON: function () {
      var out = { _id: this._id };
      for (var k in cls.defaults) {
        out[k] = this[k];
      }
      return out;
    },

    save: function () {
      var $this = this;
      return new Promise(function (resolve, reject) {
        $this.updatedAt = Date.now();
        var data = $this.toJSON();
        var coll = models.db.collection(cls.collection);
        coll.update({ _id: $this._id}, data, { upsert: true },
          function (err, results) {
            return (err) ?  reject(err) : resolve($this);
          });
      });
    },

    destroy: function (next) {
      var $this = this;
      return new Promise(function (resolve, reject) {
        var coll = models.db.collection(cls.collection);
        coll.remove({ _id: $this._id }, { w: 1 },
          function (err, numRemoved) {
            return (err) ?  reject(err) : resolve(numRemoved > 0);
          });
      });
    }

  });

  return cls;
};

var mods = requireDir();
for (name in mods) {
  models[name] = mods[name](models, baseClass);
}
