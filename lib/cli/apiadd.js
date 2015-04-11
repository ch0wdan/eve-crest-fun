module.exports = function (program, init) {
  program.command('apiadd <keyID> <vCode>')
    .description('add an API key')
    .action(init(cmd));
};

var Promise = require('bluebird');
var models = require('../models');

function cmd (args, options, shared) {
  var logger = shared.logger;
  var db = shared.db;

  var keyID = args.shift();
  var vCode = args.shift();

  var apikey;

  models.APIKey.getOrCreate({ keyID: keyID }).then(function (apikey) {
    apikey.vCode = vCode;
    return apikey.update();
  }).then(function (result) {
    apikey = result;
    logger.info('API key', apikey.keyID, 'updated');
    return apikey.findCharacters();
  }).then(function (characters) {
    logger.debug('\tAccount create date', apikey.account.createDate);
    logger.debug('\tUpdated', characters.length, 'characters');
    characters.forEach(function (character) {
      logger.debug('\t\t' + character.characterName);
    });
    return shared.done();
  }).catch(function (err) {
    logger.error('Problem adding API key', err);
    return shared.done();
  });
}
