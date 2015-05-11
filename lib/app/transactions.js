var _ = require('lodash');
var main = require(__dirname + '/..');
var Promise = require('bluebird');
var eveData = require('../eveData');
var models = require('../models');

module.exports = function (options, shared, app) {

  var transactions = app.route('/transactions');

  transactions.get(function (req, res) {

    models.Transaction.find().then(function (transactions) {

      // Assemble unique character IDs, fetch them, decorate the transactions
      return Promise.props(
        _.chain(transactions).pluck('characterID').uniq()
          .map(function (characterID) {
            return [
              characterID,
              models.Character.find({ characterID: characterID })
            ];
          }).object().value()
      ).then(function (characters) {
        return transactions.map(function (transaction) {
          var character = characters[transaction.characterID][0];
          transaction = transaction.toJSON();
          transaction.characterName = character.characterName;
          return transaction;
        });
      });

    }).then(function (transactions) {

      var transactions = _.chain(transactions)
        .groupBy('typeName')
        .map(function (value, key) {
          return [
            key,
            _.chain(value)
              .map(function (transaction) {
                transaction = _.pick(transaction,
                    'transactionDateTime', 'characterName', 'transactionType',
                    'quantity', 'price', 'stationName');
                transaction.price = parseFloat(transaction.price);
                return transaction;
              })
              .sortByAll('transactionDateTime').reverse()
              .groupBy('characterName').value()
          ];
        }).object().value();

      res.render('transactions.html', {
        transactions: transactions,
        transactions_json: JSON.stringify(transactions, null, '  ')
      });

    });

  });

};
