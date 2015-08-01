module.exports = function (program, init) {
  program.command('importblueprints <filename>')
    .description('import blueprints data')
    .action(init(cmd));
};

var Promise = require('bluebird');
var models = require('../models');
var yaml = require('js-yaml');
var fs = require('fs');
var _ = require('lodash');

function cmd (args, options, shared) {

  var logger = shared.logger;
  var data = fs.readFileSync(args[0], 'utf8');
  var doc = yaml.safeLoad(data);

  Promise.resolve(_.values(doc))
    .map(function (data) { return models.Blueprint.create(data); })
    .map(function (blueprint) { return blueprint.denormalize(); })
    .map(function (blueprint) { return blueprint.save(); })
    .then(function (blueprints) { return shared.done(); })
    .catch(console.error);

}
