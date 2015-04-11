var _ = require('lodash');
var Promise = require('bluebird');
var eveData = require('../eveData');

module.exports = function (models, baseClass) {
  var Character = baseClass();

  Character.collection = 'Characters';

  Character.defaults = {
    keyID: null,
    characterID: null,
    characterName: null,
    race: null,
    bloodline: null,
    accountBalance: null,
    skillPoints: null,
    shipName: null,
    shipTypeID: null,
    shipTypeName: null,
    corporationID: null,
    corporationName: null,
    allianceID: null,
    allianceName: null,
    factionID: null,
    factionName: null,
    lastKnownLocation: null,
    securityStatus: null,
    employmentHistory: null,
    characterSheet: null,
    homeStationID: null,
    DoB: null,
    bloodLine: null,
    ancestry: null,
    gender: null,
    cloneTypeID: null,
    cloneName: null,
    cloneSkillPoints: null,
    freeSkillPoints: null,
    freeRespecs: null,
    cloneJumpDate: null,
    lastRespecDate: null,
    lastTimedRespec: null,
    remoteStationDate: null,
    jumpClones: null,
    jumpCloneImplants: null,
    jumpActivation: null,
    jumpFatigue: null,
    jumpLastUpdate: null,
    balance: null,
    implants: null,
    attributes: null,
    skills: null,
    certificates: null,
    corporationRoles: null,
    corporationRolesAtHQ: null,
    corporationRolesAtBase: null,
    corporationRolesAtOther: null,
    corporationTitles: null
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
      return apikey.fetch('char:CharacterSheet', { characterID: $this.characterID });
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
