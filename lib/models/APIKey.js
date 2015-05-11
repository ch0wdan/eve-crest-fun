var _ = require('lodash');
var Promise = require('bluebird');
var eveData = require('../eveData');
var request = Promise.promisify(require('request'));
var neow = require('neow');

var main = require(__dirname + '/..');

module.exports = function (models, baseClass) {
  var APIKey = baseClass();

  APIKey.collection = 'APIKeys';

  APIKey.fields = {
    keyID: {},
    vCode: {},
    accessMask: {},
    type: {},
    expires: {},
    account: {},
    callGroups: {},
    calls: {}
  };

  APIKey.id = function (obj) {
    return obj.keyID;
  };

  APIKey.prototype.getClient = function () {
    var client = new neow.EveClient({
      keyID: this.keyID,
      vCode: this.vCode
    });
    return client;
  };

  APIKey.prototype.fetch = function (method, opts) {
    return this.getClient().fetch(method, opts);
  };

  APIKey.prototype.findCharacters = function () {
    return models.Character.find({ keyID: this.keyID });
  };

  APIKey.prototype.update = function () {
    var $this = this;
    return $this.getClient().fetch('account:APIKeyInfo')
      .then(function (result) {
        $this.accessMask = result.key.accessMask;
        $this.type = result.key.type;
        $this.expires = result.key.expires;
        return $this.save().then(function () {
          return Promise.all([
            $this.updateAccountStatus(),
            $this.updateCallList(),
            $this.updateCharacters(result.key.characters)
          ]);
        });
      })
      .then(function () { return $this; });
  };

  APIKey.prototype.updateAccountStatus = function () {
    var $this = this;
    return $this.getClient().fetch('account:AccountStatus')
      .then(function (result) {
        $this.account = {
          paidUntil: result.paidUntil.content,
          createDate: result.createDate.content,
          logonCount: result.logonCount.content,
          logonMinutes: result.logonMinutes.content,
          multiCharacterTraining: result.multiCharacterTraining
        };
        return $this.save();
      });
  };

  APIKey.prototype.updateCallList = function () {
    var $this = this;
    return $this.getClient().fetch('api:CallList')
      .then(function (result) {
        $this.callGroups = result.callGroups;
        $this.calls = result.calls;
        return $this.save();
      });
  };

  APIKey.prototype.updateCharacters = function (characters) {
    var $this = this;
    return Promise.all(_.map(characters, function (data, id) {
      return models.Character.getOrCreate({
        characterID: id,
        keyID: $this.keyID
      }).then(function (character) {
        return character.update();
      });
    }));
  };

  return APIKey;
};
