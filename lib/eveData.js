var util = require('util');

var _ = require('lodash');

//var conf = require(__dirname + '/config');
var logger = require('winston');

var Promise = require('bluebird');
var Knex = require('knex');

db_EVE = Knex({
  client: 'sqlite3',
  connection: { filename: './sqlite-latest.sqlite' }
});

var UNKNOWN_ICON_URL = '/Icons/items/7_64_15.png';

var eveData = exports;

eveData.lookupRegions = function (opts) {
  if (opts.regionID) {
    return new Promise(function (fulfill, reject) {
      fulfill(coerceArray(opts.regionID));
    });
  }

  var out = null;
  if (opts.constellationID) {
    out = db_EVE('mapConstellations').whereIn('constellationID',
      coerceArray(opts.constellationID));
  } else if (opts.solarSystemID) {
    out = db_EVE('mapSolarSystems').whereIn('solarSystemID',
      coerceArray(opts.solarSystemID));
  } else if (opts.stationID) {
    out = db_EVE('staStations').whereIn('stationID',
      coerceArray(opts.stationID));
  } else {
    return new Promise(function (fulfill, reject) {
      fulfill([]);
    });
  }

  return out.select('regionID').then(function (rows) {
    return rows.map(function (row) {
      return row.regionID;
    });
  });
};

eveData.mapRegions = function (opts) {
  opts = opts || {};
  var query = db_EVE('mapRegions').select();
  if (opts.regionID) {
    return query.where('regionID', '=', opts.regionID);
  }
  if (opts.regionName) {
    return query.where('regionName', '=', opts.regionName);
  }
  if (opts.q) {
    query.where('regionName', 'like', '%' + opts.q + '%');
  }
  return query;
};

eveData.mapConstellations = function (opts) {
  var query = db_EVE('mapConstellations').select();
  if (opts.regionID) {
    query.whereIn('regionID', coerceArray(opts.regionID));
  }
  if (opts.q) {
    query
      .join('mapRegions',
        'mapConstellations.regionID', '=',
        'mapRegions.regionID')
      .where('regionName', 'like', '%' + opts.q + '%')
      .orWhere('constellationName', 'like', '%' + opts.q + '%');
  }
  return query;
};

eveData.mapSolarSystems = function (opts) {
  opts = opts || {};
  var query = db_EVE('mapSolarSystems').select();
  ['regionID', 'constellationID', 'solarSystemName', 'solarSystemID']
    .forEach(function (field) {
      if (field in opts) {
        query.whereIn(field, coerceArray(opts[field]));
      }
    });
  if (opts.regionID) {
    query.whereIn('regionID', coerceArray(opts.regionID));
  }
  if (opts.constellationID) {
    query.whereIn('constellationID', coerceArray(opts.constellationID));
  }
  if (opts.q) {
    query
      .join('mapRegions',
        'mapSolarSystems.regionID', '=',
        'mapRegions.regionID')
      .join('mapConstellations',
        'mapSolarSystems.constellationID', '=',
        'mapConstellations.constellationID')
      .where('solarSystemName', 'like', '%' + opts.q + '%')
      .orWhere('regionName', 'like', '%' + opts.q + '%')
      .orWhere('constellationName', 'like', '%' + opts.q + '%');
  }
  return query;
};

eveData.staStations = function (opts) {
  opts = opts || {};
  var query = db_EVE('staStations').select();
  ['solarSystemID', 'stationName', 'stationID']
    .forEach(function (field) {
      if (field in opts) {
        query.whereIn(field, coerceArray(opts[field]));
      }
    });
  return query;
};

eveData.invTypes = function (opts) {
  opts = opts || {};

  var list_opts = ['metaLevel', 'techLevel', 'typeID', 'categoryID',
                   'metaGroupID', 'marketGroupID'];
  list_opts.forEach(function (name) {
    opts[name] = coerceArray(opts[name]);
  });

  var query = db_EVE('invTypes')
    .join('invGroups', 'invTypes.groupID', '=', 'invGroups.groupID', 'left')
    .join('invCategories', 'invGroups.categoryID', '=', 'invCategories.categoryID', 'left')
    .join('invMetaTypes', 'invTypes.typeID', '=', 'invMetaTypes.typeID', 'left')
    .join('invMetaGroups', 'invMetaTypes.metaGroupID', '=', 'invMetaGroups.metaGroupID', 'left')
    .join('dgmTypeAttributes as attrMetaLevel', function () {
      this.on('attrMetaLevel.attributeID', '=', 633);
      this.on('attrMetaLevel.typeID', '=', 'invTypes.typeID');
    }, 'left')
    .join('dgmTypeAttributes as attrTechLevel', function () {
      this.on('attrTechLevel.attributeID', '=', 422);
      this.on('attrTechLevel.typeID', '=', 'invTypes.typeID');
    }, 'left')
    .select(db_EVE.raw([
      'invGroups.groupName',
      'invMetaGroups.metaGroupName', 'invMetaGroups.metaGroupID',
      'invCategories.categoryName', 'invCategories.categoryID',
      'coalesce(attrMetaLevel.valueInt, attrMetaLevel.valueFloat) as metaLevel',
      'coalesce(attrTechLevel.valueInt, attrTechLevel.valueFloat) as techLevel',
      'invTypes.*'
    ].join(',')))
    .where('invTypes.published', '=', 1); // TODO: option?

  var mungeRows = function (rows) {

    rows = _.map(rows, function (row) {
      // Meta 0 has no real metaGroupName, but I want to pretend
      if (row.metaLevel == 0) {
        row.metaGroupID = 1;
        row.metaGroupName = 'Tech I';
      }
      return row;
    });

    // HACK: Because I can't seem to get whereIn() to work with coalesce()
    if (opts.metaLevel.length) {
      rows = _.filter(rows, function (row) {
        return opts.metaLevel.indexOf(''+row.metaLevel) !== -1;
      });
    }

    // HACK: Because I can't seem to get whereIn() to work with coalesce()
    if (opts.techLevel.length) {
      rows = _.filter(rows, function (row) {
        return opts.techLevel.indexOf(''+row.techLevel) !== -1;
      });
    }

    return rows;
  }

  if (opts.q) {
    query = query.where('invTypes.typeName', 'like', '%' + opts.q + '%');
  }

  if (opts.typeID.length) {
    query = query.whereIn('invTypes.typeID', opts.typeID);
  }

  if (opts.categoryID.length) {
    query = query.whereIn('invCategories.categoryID', opts.categoryID);
  }

  if (opts.metaGroupID.length) {
    query = query.whereIn('invMetaTypes.metaGroupID', opts.metaGroupID);
  }

  if (opts.marketGroupID.length) {
    return eveData.invMarketGroupIDs(opts.marketGroupID).then(function (ids) {
      return query.whereIn('invTypes.marketGroupID', ids).then(mungeRows);
    });
  }

  return query.then(mungeRows);
};

// Categories that match items
eveData.invCategories = function (opts) {
  opts = _.defaults(opts || {}, {
    unpublished: false
  });

  var query = db_EVE('invCategories')
    .join('eveIcons', 'eveIcons.iconID', '=', 'invCategories.iconID', 'left');

  if (!opts.unpublished) {
    query = query.where('published', '=', '1');
  }

  return query.then(function (rows) {
    return _.map(rows, fixupIconURL);
  });
}

// Meta groups that match items
eveData.invMetaGroups = function () {
  return db_EVE('invMetaGroups')
    .select(db_EVE.raw([
      'invMetaGroups.metaGroupID',
      'invMetaGroups.metaGroupName',
      'count(invTypes.typeID) as invTypesCount'
    ].join(',')))
    .join('invMetaTypes', 'invMetaTypes.metaGroupID', '=', 'invMetaGroups.metaGroupID')
    .join('invTypes', 'invTypes.typeID', '=', 'invMetaTypes.typeID')
    .groupBy('invMetaGroups.metaGroupID');
}

// Meta levels that match items
eveData.invMetaLevels = function () {
  return db_EVE('invTypes')
    .join('dgmTypeAttributes as attrMetaLevel', function () {
      this.on('attrMetaLevel.attributeID', '=', 633);
      this.on('attrMetaLevel.typeID', '=', 'invTypes.typeID');
    }, 'left')
    .select(db_EVE.raw([
      'coalesce(attrMetaLevel.valueFloat,attrMetaLevel.valueInt) as metaLevel',
      'count(invTypes.typeID) as invTypesCount'
    ].join(',')))
    .groupBy('metaLevel')
    .where('invTypes.published', '=', 1);
}

// Recursively look up market group children for a given set of IDs
eveData.invMarketGroupIDs = function (marketGroupID) {
  if (!_.isArray(marketGroupID)) {
    marketGroupID = [marketGroupID];
  }
  return db_EVE('invMarketGroups')
    .select('marketGroupID', 'parentGroupID')
    .whereIn('parentGroupID', marketGroupID)
    .then(function (rows) {
      var ids = _.map(rows, function (row) {
        return eveData.invMarketGroupIDs(row.marketGroupID);
      });
      ids.unshift(marketGroupID);
      return Promise.all(ids);
    })
    .reduce(function (a, b) {
      return a.concat(b);
    }, [])
    .then(function (results) {
      return _.uniq(results);
    });
};

eveData.invMarketGroups = function (opts) {

  var mungeMarketGroup = function (row) {
    fixupIconURL(row);
    return row;
  };

  // ?marketGroupID results in direct lookup
  if ('marketGroupID' in opts) {
    return db_EVE('invMarketGroups').select()
      .join('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID', 'left')
      .whereIn('marketGroupID', coerceArray(opts.marketGroupID))
      .then(function (rows) {
        return _.map(rows, mungeMarketGroup);
      });
  }

  var shallow = 'shallow' in opts;
  var root_ids = coerceArray(opts.root);

  // Utility to fetch root market groups and their children
  var fetchRoots = function (root_ids, shallow_roots) {
    return Promise.props(_.chain(root_ids).map(function (id) {
      var root_group = db_EVE('invMarketGroups').select()
        .join('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID', 'left')
        .where('marketGroupID', '=', id)
        .then(function (rows) {
          var row = rows[0];
          if (!row) { return null; }
          row.children = (shallow_roots) ?
            countChildren(id) : fetchChildren(id);
          row = mungeMarketGroup(row);
          return Promise.props(row);
        });
      return [id, root_group];
    }).object().value());
  };

  // Utility to fetch children of a market group
  var fetchChildren = function (marketGroupID) {
    return db_EVE('invMarketGroups').select()
      .join('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID', 'left')
      .where('parentGroupID', '=', marketGroupID)
      .then(function (rows) {
        return Promise.props(_.chain(rows).map(function (row) {
          row.children = (shallow) ?
            countChildren(row.marketGroupID) :
            fetchChildren(row.marketGroupID);
          row = mungeMarketGroup(row);
          return [row.marketGroupID, Promise.props(row)];
        }).object().value());
      });
  };

  // Utility to count children of a market group
  var countChildren = function (marketGroupID) {
    return db_EVE('invMarketGroups').select()
      .join('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID', 'left')
      .where('parentGroupID', '=', marketGroupID)
      .count('marketGroupID')
      .then(function (rows) {
        return _.values(rows[0])[0]
      });
  }

  if (root_ids && root_ids.length) {
    // Use the supplied root IDs...
    return fetchRoots(root_ids);
  } else {
    // If no root IDs supplied, look up all groups with no parents.
    return db_EVE('invMarketGroups')
      .select('marketGroupID')
      .whereNull('parentGroupID')
      .then(function (rows) {
        return fetchRoots(_.pluck(rows, 'marketGroupID'), shallow);
      });
  }
};

function coerceArray (data) {
  if (typeof data == 'undefined' || '' === data) {
    return [];
  }
  return _.isArray(data) ? data : [data];
}

function fixupIconURL (row) {
  // HACK: EVE icon filenames, why you so crazy?
  if (!row.iconFile) {
    row.iconURL = UNKNOWN_ICON_URL;
  } else if (row.iconFile.indexOf('res:/UI/Texture/Icons') === 0) {
    row.iconURL = row.iconFile.replace('res:/UI/Texture/Icons',
                       '/Icons/items');
  } else if (row.iconFile.indexOf('res:') === 0) {
    row.iconURL = UNKNOWN_ICON_URL;
  } else {
    var size_128_icons = [
      '102', '103', '104', '110', '17', '18',
      '19', '28', '29', '32', '33', '59',
      '60', '61', '65', '66', '67', '70',
      '80', '85', '86', '87', '88', '89'
    ];
    var parts = row.iconFile.split('_');
    var size = (size_128_icons.indexOf(parts[0]) !== -1) ?
      '128' : '64';
    row.iconURL = '/Icons/items/' + [
      parseInt(parts[0]), size, parseInt(parts[1])
    ].join('_') + '.png';
  }
  return row;
}
