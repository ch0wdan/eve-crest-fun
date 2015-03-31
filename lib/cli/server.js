module.exports = function (program, init) {
  program
    .command('server')
    .description('Start web app')
    .action(init(cmd));
};

function cmd (args, options, shared) {
  var logger = shared.logger;
  require('../app')(options, shared).then(function (server) {
    logger.info('Express server listening on port ' + server.port);
  }).catch(function (err) {
    logger.error(err);
  });
}
