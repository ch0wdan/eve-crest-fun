var _ = require('lodash');
var Promise = require('bluebird');
var eveData = require('../eveData');

module.exports = function (models, baseClass) {
  var Character = baseClass();

  Character.collection = 'Characters';

  Character.fields = {
    keyID: {},
    characterID: {},
    characterName: {},
    race: {},
    bloodline: {},
    accountBalance: {},
    skillPoints: {},
    shipName: {},
    shipTypeID: {},
    shipTypeName: {},
    corporationID: {},
    corporationName: {},
    allianceID: {},
    allianceName: {},
    factionID: {},
    factionName: {},
    lastKnownLocation: {},
    securityStatus: {},
    employmentHistory: {},
    characterSheet: {},
    homeStationID: {},
    DoB: {},
    bloodLine: {},
    ancestry: {},
    gender: {},
    cloneTypeID: {},
    cloneName: {},
    cloneSkillPoints: {},
    freeSkillPoints: {},
    freeRespecs: {},
    cloneJumpDate: {},
    lastRespecDate: {},
    lastTimedRespec: {},
    remoteStationDate: {},
    jumpClones: {},
    jumpCloneImplants: {},
    jumpActivation: {},
    jumpFatigue: {},
    jumpLastUpdate: {},
    balance: {},
    implants: {},
    attributes: {},
    skills: {},
    certificates: {},
    corporationRoles: {},
    corporationRolesAtHQ: {},
    corporationRolesAtBase: {},
    corporationRolesAtOther: {},
    corporationTitles: {}
  };

  Character.id = function (obj) {
    return obj.characterID + ':' + obj.keyID;
  };

  function flattenContent (obj, data) {
    _.each(data, function (value, key) {
      obj[key] = (_.isObject(value) && 'content' in value) ?
        value.content : value;
    });
    return obj;
  }

  Character.prototype.update = function () {
    var $this = this;
    return models.APIKey.get({ keyID: $this.keyID }).then(function (apikey) {
      return apikey.fetch('eve:CharacterInfo', {
        characterID: $this.characterID
      });
    }).then(function (result) {
      flattenContent($this, result);
      return $this.save();
    });
  };

  Character.prototype.updateCharacterSheet = function () {
    var $this = this;
    return models.APIKey.get({ keyID: $this.keyID }).then(function (apikey) {
      return apikey.fetch('char:CharacterSheet', {
        characterID: $this.characterID
      });
    }).then(function (result) {
      flattenContent($this, result);
      return eveData.invTypes({ typeID: _.keys($this.skills) });
    }).then(function (types) {
      var byID = _.indexBy(types, 'typeID');
      _.each($this.skills, function (skill, typeID) {
        skill.typeName = byID[typeID].typeName;
      });
      return $this.save();
    });
  };

  Character.prototype.updateJournalEntries = function () {
    var $this = this;
    return models.APIKey.get({ keyID: $this.keyID }).then(function (apikey) {
      return apikey.fetch('char:WalletJournal', {
        characterID: $this.characterID,
        rowCount: 1000
      });
    }).then(function (result) {
      return Promise.all(_.map(result.transactions, function (data, id) {
        return models.JournalEntry.getOrCreate({ refID: id })
          .then(function (transaction) {
            _.assign(transaction, data);
            transaction.characterID = $this.characterID;
            return transaction.save();
          });
      }));
    });
  };

  Character.prototype.updateTransactions = function () {
    var $this = this;
    return models.APIKey.get({ keyID: $this.keyID }).then(function (apikey) {
      return apikey.fetch('char:WalletTransactions', {
        characterID: $this.characterID,
        rowCount: 1000
      });
    }).then(function (result) {
      return Promise.all(_.map(result.transactions, function (data, id) {
        return models.Transaction.getOrCreate({ transactionID: id })
          .then(function (transaction) {
            _.assign(transaction, data);
            transaction.characterID = $this.characterID;
            return transaction.save();
          });
      }));
    });
  };

  Character.prototype.updateOrders = function () {
    var $this = this;
    return models.APIKey.get({ keyID: $this.keyID }).then(function (apikey) {
      return apikey.fetch('char:MarketOrders', {
        characterID: $this.characterID
      });
    }).then(function (result) {
      return Promise.all(_.map(result.orders, function (data, id) {
        return models.Order.getOrCreate({ orderID: id })
          .then(function (order) {
            _.assign(order, data);
            order.characterID = $this.characterID;
            return order.save();
          });
      }));
    });
  };

  return Character;
};
