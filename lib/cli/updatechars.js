module.exports = function (program, init) {
  program.command('updatechars')
    .description('update character data')
    .action(init(cmd));
};

var Promise = require('bluebird');
var models = require('../models');

function cmd (args, options, shared) {
  var logger = shared.logger;
  models.Character.find().map(function (character) {
    return Promise.props({
      character: character.update(),
      journal: character.updateJournalEntries(),
      transactions: character.updateTransactions(),
      orders: character.updateOrders(),
      characterSheet: character.updateCharacterSheet()
    });
  }).map(function (result) {
    logger.info('Updated', result.character.characterName, result.character.characterID);
    logger.debug('\t', result.journal.length, 'journal entries');
    logger.debug('\t', result.transactions.length, 'transactions');
    logger.debug('\t', result.orders.length, 'orders');
  }).catch(function (err) {
    logger.error(err);
  }).finally(function () {
    return shared.done();
  });
}
