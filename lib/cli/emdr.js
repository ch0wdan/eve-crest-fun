try {
  // HACK: Try loading zmq - if it's missing, we can skip registering this
  // command because it won't work (eg. on windows)
  var blessed = require('blessed');
  var zmq = require('zmq');
  var zlib = require('zlib');
  var sock = zmq.socket('sub');

  module.exports = function (program, init) {
    program.command('emdr')
      .description('Import market orders from the EMDR stream')
      .option('-r, --regions <name,name,name>', 'regional market for scan', list)
      .option('-g, --groups <id,id,...,id>', 'market group for items', list)
      .action(init(cmd));
  };
} catch (e) {
  module.exports = function (program, init) { /* no-op */ }
}

function list (val) {
  return val.split(/,/g);
}

var util = require('util');
var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var request = Promise.promisify(require('request'));

var eveData = require('../eveData');
var main = require(__dirname + '/..');
var models = require('../models');

var logger = require('winston');
var Winston_Transport = require('winston/lib/winston/transports/transport').Transport;
var Winston_Common = require('winston/lib/winston/common');

var ct = { emdr: 0, orders: 0, history: 0 };
var ctWindow = { emdr: 0, orders: 0, history: 0 };
var ctBoxes = {};
var t_start, t_window, screen, root;

var WINDOW_DURATION = (1000 * 60 * 5);

function cmd (args, options, shared) {
  setupUI();
  setInterval(renderUI, 100);
  connectEMDR();
}

function connectEMDR () {
  sock.connect('tcp://relay-us-central-1.eve-emdr.com:8050');
  sock.subscribe('');
  sock.on('message', function (msg) {
    try {
      zlib.inflate(msg, function (err, market_json) {
        queues.emdr.push(JSON.parse(market_json));
      });
    } catch (e) {
      logger.error("ZMQ error " + e);
    }
  });
  sock.on('disconnect', function (msg) {
    logger.error("EMDR socket disconnected");
    exit();
  });
}

var queues = {};

// Maps of EMDR to CREST row field names
var fieldMaps = {
  'orders': {
     "price": "price",
     "volRemaining": "volume",
     "range": "range",
     "orderID": "id",
     "volEntered": "volumeEntered",
     "minVolume": "minVolume",
     "bid": "bid",
     "issueDate": "issued",
     "duration": "duration",
     "stationID": "stationId",
     "solarSystemID": "solarSystemId"
  },
  'history': {
     "date": "date",
     "orders": "orderCount",
     "quantity": "volume",
     "low": "lowPrice",
     "high": "highPrice",
     "average": "avgPrice"
  }
};

queues.emdr = async.queue(function (task, next) {
  ct.emdr++;

  // TODO: Track uploadKeys to ignore repeats
  // TODO: Track currentTime to ignore old data
  task.rowsets.forEach(function (rowset) {
    if (!task.resultType in queues) { return; }
    var fieldMap = fieldMaps[task.resultType];
    var columns = task.columns.map(function (name) {
      return (name in fieldMap) ? fieldMap[name] : name;
    });
    queues[task.resultType].push({
      typeID: rowset.typeID,
      regionID: rowset.regionID,
      generatedAt: rowset.generatedAt,
      rows: _.map(rowset.rows, function (row) {
        return _.zipObject(columns, row);
      })
    });
  });
  return next();
});

queues.orders = async.queue(function (task, next) {
  return Promise.resolve(task.rows).map(lookupLocation).then(function (rows) {
    return Promise.all([
      _.groupBy(rows, 'bid'),
      models.MarketType.getOrCreate({
        typeID: task.typeID,
        regionID: task.regionID
      })
    ]);
  }).spread(function (rows, type) {
    if (!type) {
      throw new Error("No type for " + task.typeID);
    }
    type.sellOrders = rows[false] || [];
    type.buyOrders = rows[true] || [];
    return type.calculateSummaries();
  }).then(function (type) {
    return type.save();
  }).then(function (type) {
    logger.debug(type.sellOrders.length + ' / ' + type.buyOrders.length +
      ' orders for ' + type.typeName + ' in ' + type.regionID);
  }).catch(function (err) {
    logger.error("Orders error " + err);
  }).finally(function () {
    ct.orders++;
    return next();
  });
});

queues.history = async.queue(function (task, next) {
  return models.MarketType.getOrCreate({
    typeID: task.typeID,
    regionID: task.regionID
  }).then(function (type) {
    type.history = task.rows;
    return type.calculateSummaries();
  }).then(function (type) {
    return type.save();
  }).then(function (type) {
    logger.debug(type.history.length + ' history for ' + type.typeName + ' in ' + type.regionID);
  }).catch(function (err) {
    logger.error("History error " + err);
  }).finally(function () {
    ct.history++;
    return next();
  });
});

var locationCache = {};

function lookupLocation(row) {
  if (row.stationId in locationCache) {
    row.location = locationCache[row.stationId];
    return row;
  }
  return eveData.staStations({
    stationID: row.stationId
  }).then(function (stations) {
    if (stations.length) {
      var station = stations[0];
      var location = {
        id: station.stationID,
        href: 'https://crest-tq.eveonline.com/universe/locations/' + station.stationID + '/',
        name: station.stationName
      };
      row.location = locationCache[row.stationId] = location;
    }
    return row;
  });
}

function setupUI () {
  t_start = Date.now();
  t_window = t_start;

  screen = blessed.screen();

  root = blessed.box({
    top: 'center', left: 'center', width: '100%', height: '100%',
    border: { type: 'line' }, autoPadding: true, padding: 1,
    label: 'EMDR processing',
    style: { fg: 'white', bg: 'black' }
  });
  screen.append(root);

  var hpos = 0;
  var flds = _.keys(ct);
  var width = (100 / flds.length);
  flds.forEach(function (name) {
    ctBoxes[name] = blessed.box({
      top: 1, left: hpos + '%', width: width + '%', height: '20%',
      border: { type: 'line' }, padding: 1,
      align: 'center', label: name
    });
    hpos += (width);
    root.append(ctBoxes[name]);
  });

  var errLogBox = blessed.scrollablebox({
    top: '20%', left: 0, width: '100%', height: '40%',
    border: { type: 'line' }, padding: 0,
    label: 'errors', align: 'left', scrollable: true
  });
  root.append(errLogBox);

  var outLogBox = blessed.scrollablebox({
    top: '60%', left: 0, width: '100%', height: '40%',
    border: { type: 'line' }, padding: 0,
    align: 'left', label: 'log',
    scrollable: true
  });
  root.append(outLogBox);

  logger.remove(logger.transports.Console);
  logger.add(LogBoxTransport, {
    outLogBox: outLogBox,
    errLogBox: errLogBox,
    history: 50,
    level: 'silly',
    timestamp: true,
    colorize: true
  });

  // Quit on Escape, q, or Control-C.
  screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    process.exit();
  });
}

function renderUI () {
  var t_duration = Date.now() - t_start;
  var t_window_duration = Date.now() - t_window;

  if (t_window_duration > WINDOW_DURATION) {
    t_window = Date.now();
    t_window_duration = 1;
    _.each(ct, function (amt, name) {
      ctWindow[name] = ct[name];
    });
  }

  var t_minutes = t_window_duration / (1000 * 60);

  var uptime = Math.round(t_duration / 1000);
  root.setLabel('EVEMF EMDR processing (Uptime: ' + uptime + 's)');

  _.each(ct, function (amt, name) {
    ctBoxes[name].setContent([
      queues[name].length() + ' queued',
      amt + ' processed',
      Math.round((amt - ctWindow[name]) / t_minutes) + ' per min'
    ].join("\n"));
  });

  screen.render();
}

var LogBoxTransport = function (options) {
  Winston_Transport.call(this, options);
  options = options || {};

  this.out = [];
  this.err = [];

  this.outLogBox   = options.outLogBox   || false;
  this.errLogBox   = options.errLogBox   || false;
  this.history   = options.history   || 10;

  this.json    = options.json    || false;
  this.colorize  = options.colorize  || false;
  this.prettyPrint = options.prettyPrint || false;
  this.timestamp   = typeof options.timestamp !== 'undefined' ? options.timestamp : false;
  this.label     = options.label     || null;

  if (this.json) {
    this.stringify = options.stringify || function (obj) {
      return JSON.stringify(obj, null, 2);
    };
  }
};

util.inherits(LogBoxTransport, Winston_Transport);

LogBoxTransport.prototype.log = function (level, msg, meta, callback) {
  var self = this, output;

  if (self.silent) { return callback(null, true); }

  output = Winston_Common.log({
    level:     level,
    message:   msg,
    meta:    meta,
    colorize:  self.colorize,
    json:    self.json,
    stringify:   self.stringify,
    timestamp:   self.timestamp,
    prettyPrint: self.prettyPrint,
    raw:     self.raw,
    label:     self.label
  });

  var msgs = (level === 'error') ? this.err : this.out;
  var box = (level === 'error') ? this.errLogBox : this.outLogBox;

  msgs.push(output);
  if (msgs.length > self.history) { msgs.shift(); }
  box.setContent(msgs.join("\n"));
  box.scrollTo(box.getScrollHeight());

  self.emit('logged');
  callback(null, true);
};
