module.exports = function (program, init) {
  program
    .command('hello')
    .description('say hello')
    .action(init(cmd));
};

function cmd (args, options, shared) {
  var logger = shared.logger;
  var db = shared.db;

  logger.debug('hello');
}
