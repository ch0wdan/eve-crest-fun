var util = require('util');

var _ = require('lodash');

var logger = require('winston');

var Promise = require('bluebird');
var Knex = require('knex');

var dbEVE = exports.dbEVE = Knex({
  client: 'sqlite3',
  // debug: true,
  connection: {
    filename: './data/sqlite-latest.sqlite'
  }
});

var UNKNOWN_ICON_URL = '/Icons/items/7_64_15.png';

var eveData = exports;

eveData.close = function () {
  return dbEVE.destroy();
};

eveData.lookupRegions = function (opts) {
  if (opts.regionID) {
    return new Promise(function (fulfill, reject) {
      fulfill(coerceArray(opts.regionID));
    });
  }

  var out = null;
  if (opts.constellationID) {
    out = dbEVE('mapConstellations').whereIn('constellationID',
      coerceArray(opts.constellationID));
  } else if (opts.solarSystemID) {
    out = dbEVE('mapSolarSystems').whereIn('solarSystemID',
      coerceArray(opts.solarSystemID));
  } else if (opts.stationID) {
    out = dbEVE('staStations').whereIn('stationID',
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
  var query = dbEVE('mapRegions').select();
  if (opts.regionID) {
    return query.where('regionID', '=', opts.regionID);
  }
  if (opts.regionName) {
    if (_.isArray(opts.regionName)) {
      return query.whereIn('regionName', opts.regionName);
    }
    return query.where('regionName', '=', opts.regionName);
  }
  if (opts.q) {
    query.where('regionName', 'like', '%' + opts.q + '%');
  }
  return query;
};

eveData.mapConstellations = function (opts) {
  var query = dbEVE('mapConstellations').select();
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
  var query = dbEVE('mapSolarSystems').select();
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
  var query = dbEVE('staStations').select();
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

  var query = dbEVE('invTypes')
    .leftJoin('invGroups', 'invTypes.groupID', '=', 'invGroups.groupID')
    .leftJoin('invCategories', 'invGroups.categoryID', '=', 'invCategories.categoryID')
    .leftJoin('invMetaTypes', 'invTypes.typeID', '=', 'invMetaTypes.typeID')
    .leftJoin('invMetaGroups', 'invMetaTypes.metaGroupID', '=', 'invMetaGroups.metaGroupID')
    .leftJoin('dgmTypeAttributes as attrMetaLevel', function () {
      this.on('attrMetaLevel.attributeID', '=', 633);
      this.on('attrMetaLevel.typeID', '=', 'invTypes.typeID');
    })
    .leftJoin('dgmTypeAttributes as attrTechLevel', function () {
      this.on('attrTechLevel.attributeID', '=', 422);
      this.on('attrTechLevel.typeID', '=', 'invTypes.typeID');
    })
    .select(dbEVE.raw([
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
    return eveData.invMarketGroupIDs({
      marketGroupID: opts.marketGroupID
    }).then(function (ids) {
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

  var query = dbEVE('invCategories')
    .leftJoin('eveIcons', 'eveIcons.iconID', '=', 'invCategories.iconID');

  if (!opts.unpublished) {
    query = query.where('published', '=', '1');
  }

  return query.then(function (rows) {
    return _.map(rows, fixupIconURL);
  });
}

// Meta groups that match items
eveData.invMetaGroups = function () {
  return dbEVE('invMetaGroups')
    .select(dbEVE.raw([
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
  return dbEVE('invTypes')
    .leftJoin('dgmTypeAttributes as attrMetaLevel', function () {
      this.on('attrMetaLevel.attributeID', '=', 633);
      this.on('attrMetaLevel.typeID', '=', 'invTypes.typeID');
    })
    .select(dbEVE.raw([
      'coalesce(attrMetaLevel.valueFloat,attrMetaLevel.valueInt) as metaLevel',
      'count(invTypes.typeID) as invTypesCount'
    ].join(',')))
    .groupBy('metaLevel')
    .where('invTypes.published', '=', 1);
}

eveData.invMarketGroupPath = function (marketGroupID) {
  return dbEVE('invMarketGroups')
    .select('marketGroupID', 'parentGroupID')
    .where('marketGroupID', '=', marketGroupID)
    .then(function (rows) {
      if (!rows.length) { return []; }
      if (!rows[0].parentGroupID) { return []; }
      return Promise.all([
        eveData.invMarketGroupPath(rows[0].parentGroupID)
      ]);
    })
    .reduce(function (a, b) {
      return a.concat(b);
    }, [marketGroupID]);
};

// Recursively look up market group children for a given set of IDs
eveData.invMarketGroupIDs = function (opts) {

  var marketGroupID = coerceArray(opts.marketGroupID);
  if (!marketGroupID.length) { return []; }

  return dbEVE('invMarketGroups')
    .select('marketGroupID', 'parentGroupID')
    .whereIn('parentGroupID', marketGroupID)
    .then(function (rows) {
      return eveData.invMarketGroupIDs({
        marketGroupID: _.pluck(rows, 'marketGroupID')
      });
    })
    .reduce(function (a, b) { return a.concat(b); }, marketGroupID)
    .then(function (results) { return _.uniq(results); });
};

eveData.invMarketGroups = function (opts) {
  opts = opts || {};

  var mungeMarketGroup = function (row) {
    fixupIconURL(row);
    return row;
  };

  // ?marketGroupID results in direct lookup
  if ('marketGroupID' in opts) {
    return dbEVE('invMarketGroups').select()
      .leftJoin('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID')
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
      var root_group = dbEVE('invMarketGroups').select()
        .leftJoin('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID')
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
    }).filter(function (props) {
      return props[1] !== null;
    }).object().value());
  };

  // Utility to fetch children of a market group
  var fetchChildren = function (marketGroupID) {
    return dbEVE('invMarketGroups').select()
      .leftJoin('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID')
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
    return dbEVE('invMarketGroups').select()
      .leftJoin('eveIcons', 'eveIcons.iconID', '=', 'invMarketGroups.iconID')
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
    return dbEVE('invMarketGroups')
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
