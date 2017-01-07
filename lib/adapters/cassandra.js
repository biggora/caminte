/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var cassandra = safeRequire('cassandra-driver');
var Types = cassandra.types;
var timeUUID = Types.timeuuid;
var util = require('util');
var url = require('url');
var BaseSQL = require('../sql');

exports.initialize = function initializeSchema(schema, callback) {
    if (!cassandra) {
        return;
    }
    var s = schema.settings;
    if (s.url) {
        var uri = url.parse(s.url);
        s.host = uri.hostname;
        s.port = uri.port || '9042';
        s.database = uri.pathname.replace(/^\//, '');
        s.username = uri.auth && uri.auth.split(':')[0];
        s.password = uri.auth && uri.auth.split(':')[1];
    }
    s.host = s.host || 'localhost';
    s.port = parseInt(s.port || '9042', 10);
    s.database = s.database || s.keyspace || 'test';

    if (!(s.host instanceof Array)) {
        s.host = [s.host];
    }

    schema.client = new cassandra.Client({
        contactPoints: s.host,
        protocolOptions: {
            maxVersion: 3
        },
        autoPage: true
    });
    // , keyspace: s.database
    schema.adapter = new Cassandra(schema, schema.client);

    schema.client.connect(function (err, result) {
        schema.client.execute("CREATE KEYSPACE IF NOT EXISTS " + s.database.toString() + " WITH replication " +
            "= {'class' : 'SimpleStrategy', 'replication_factor' : 2};", function (err, data) {
                console.log('Cassandra connected.');
                schema.client.keyspace = s.database;
                process.nextTick(callback);
            }
        );
    });

};

function Cassandra(schema, client) {
    this.name = 'cassandra';
    this._models = {};
    this.client = client;
    this.schema = schema;
}

util.inherits(Cassandra, BaseSQL);

Cassandra.prototype.execute = function (sql, callback) {
    var self = this;
    var client = self.client;
    client.execute(sql, callback);
};

Cassandra.prototype.query = function (sql, callback) {
    'use strict';
    var self = this;
    if (typeof callback !== 'function') {
        throw new Error('callback should be a function');
    }
    self.execute(sql, function (err, data) {
        if (err && err.message.match(/does\s+not\s+exist/i)) {
            self.query('CREATE KEYSPACE IF NOT EXISTS ' + self.schema.settings.database, function (error) {
                if (!error) {
                    self.execute(sql, callback);
                } else {
                    callback(err);
                }
            });
        } else if (err && (err.message.match(/no\s+keyspace\s+has\s+been\s+specified/gi) || parseInt(err.errno) === 1046)) {
            self.execute('USE ' + self.schema.settings.database + '', function (error) {
                if (!error) {
                    self.execute(sql, callback);
                } else {
                    callback(error);
                }
            });
        } else {
            var rows = [];
            data = data || {};
            if (data.rows && data.rows.length) {
                rows = data.rows;
            }
            return callback(err, rows);
        }
    });
};

/**
 * Must invoke callback(err, id)
 * @param {Object} model
 * @param {Object} data
 * @param {Function} callback
 */
Cassandra.prototype.create = function (model, data, callback) {
    'use strict';
    var self = this;
    var props = self._models[model].properties;
    data = data || {};
    if (data.id === null) {
        data.id = timeUUID();
    }
    var keys = [];
    var questions = [];
    Object.keys(data).map(function (key) {
        var val = self.toDatabase(props[key], data[key]);
        if (val !== 'NULL') {
            keys.push(key);
            questions.push(val);
        }
    });
    var sql = 'INSERT INTO ' + self.tableEscaped(model) + ' (' + keys.join(',') + ') VALUES (';
    sql += questions.join(',');
    sql += ')';
    this.query(sql, function (err, info) {
        callback(err, !err && data.id);
    });
};

Cassandra.prototype.all = function all(model, filter, callback) {
    'use strict';
    var self = this, sFields = '*';
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }

    var sql = 'SELECT ' + sFields + ' FROM ' + self.tableEscaped(model);

    if (filter) {

        if (filter.fields) {
            if (typeof filter.fields === 'string') {
                sFields = self.tableEscaped(filter.fields);
            } else if (Object.prototype.toString.call(filter.fields) === '[object Array]') {
                sFields = filter.fields.map(function (field) {
                    return '`' + field + '`';
                }).join(', ');
            }
            sql = sql.replace('*', sFields);
        }

        if (filter.where) {
            sql += ' ' + self.buildWhere(filter.where, self, model);
        }

        if (filter.order) {
            sql += ' ' + self.buildOrderBy(filter.order);
        }

        if (filter.group) {
            sql += ' ' + self.buildGroupBy(filter.group);
        }

        if (filter.limit) {
            sql += ' ' + self.buildLimit(filter.limit, filter.offset || filter.skip || 0);
        }

    }

    this.query(sql, function (err, data) {
        if (err) {
            return callback(err, []);
        }
        callback(null, data.map(function (obj) {
            return self.fromDatabase(model, obj);
        }));
    }.bind(this));

    return sql;
};

Cassandra.prototype.update = function (model, filter, data, callback) {
    'use strict';
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    var self = this;
    var combined = [];
    var props = self._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key] || key === 'id') {
            var k = '' + key + '';
            var v;
            if (key !== 'id') {
                v = self.toDatabase(props[key], data[key]);
            } else {
                v = data[key];
            }
            combined.push(k + ' = ' + v);
        }
    });
    var sql = 'UPDATE ' + this.tableEscaped(model);
    sql += ' SET ' + combined.join(', ');
    sql += ' ' + self.buildWhere(filter, self, model);

    this.query(sql, function (err, affected) {
        callback(err, !err);
    });
};

Cassandra.prototype.destroyAll = function destroyAll(model, callback) {
    this.query('TRUNCATE ' + this.tableEscaped(model), function (err) {
        if (err) {
            return callback(err, []);
        }
        callback(err);
    }.bind(this));
};

/**
 * Update existing database tables.
 * @param {Function} cb
 */
Cassandra.prototype.autoupdate = function (cb) {
    'use strict';
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.query('SELECT column_name as field, type, validator, index_type, index_name FROM system.schema_columns ' +
            'WHERE keyspace_name = \'' + self.schema.settings.database + '\' ' +
            'AND columnfamily_name = \'' + self.escapeName(model) + '\'',
            function (err, data) {
                var indexes = data.filter(function (m) {
                        return m.index_type !== null || m.type === 'partition_key';
                    }) || [];
                if (!err && data.length) {
                    self.alterTable(model, data, indexes || [], done);
                } else {
                    self.createTable(model, indexes || [], done);
                }
            });
    });

    function done(err) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0 && cb) {
            cb();
        }
    }
};

Cassandra.prototype.alterTable = function (model, actualFields, actualIndexes, done, checkOnly) {
    'use strict';
    var self = this;
    var m = this._models[model];
    var propNames = Object.keys(m.properties).filter(function (name) {
        return !!m.properties[name];
    });
    var indexNames = m.settings.indexes ? Object.keys(m.settings.indexes).filter(function (name) {
        return !!m.settings.indexes[name];
    }) : [];
    var sql = [];
    var ai = {};

    if (actualIndexes) {
        actualIndexes.forEach(function (i) {
            var name = i.index_name || i.field;
            if (!ai[name]) {
                ai[name] = {
                    info: i,
                    columns: []
                };
            }
            ai[name].columns.push(i.field);
        });
    }
    var aiNames = Object.keys(ai);

    // change/add new fields
    propNames.forEach(function (propName) {
        if (propName === 'id') {
            return;
        }
        var found;
        actualFields.forEach(function (f) {
            if (f.field === propName) {
                found = f;
            }
        });

        if (found) {
            actualize(propName, found);
        } else {
            // ALTER TABLE users ADD top_places list<text>;
            sql.push('ALTER TABLE ' + self.escapeName(model) + ' ADD ' + self.propertySettingsSQL(model, propName));
        }
    });

    // drop columns
    actualFields.forEach(function (f) {
        var notFound = !~propNames.indexOf(f.field);
        if (f.field === 'id') {
            return;
        }
        if (notFound || !m.properties[f.field]) {
            // ALTER TABLE addamsFamily DROP gender;
            sql.push('ALTER TABLE ' + self.escapeName(model) + ' DROP ' + f.field + '');
        }
    });

    // remove indexes
    aiNames.forEach(function (indexName) {
        if (indexName === 'id' || indexName === 'PRIMARY') {
            return;
        }

        if ((indexNames.indexOf(indexName) === -1 && !m.properties[indexName])
            || (m.properties[indexName] && !m.properties[indexName].index && !ai[indexName])) {
            sql.push('DROP INDEX IF EXISTS ' + indexName + '');
        } else {
            // first: check single (only type and kind)
            if (m.properties[indexName] && !m.properties[indexName].index) {
                // TODO
                return;
            }
            // second: check multiple indexes
            var orderMatched = true;
            if (indexNames.indexOf(indexName) !== -1) {
                m.settings.indexes[indexName].columns.split(/,\s*/).forEach(function (columnName, i) {
                    if (ai[indexName].columns[i] !== columnName)
                        orderMatched = false;
                });
            }
            if (!orderMatched) {
                sql.push('DROP INDEX IF EXISTS ' + indexName + '');
                delete ai[indexName];
            }
        }
    });

    // add single-column indexes
    propNames.forEach(function (propName) {
        var i = m.properties[propName].index;
        if (!i) {
            return;
        }
        var found = ai[propName] && ai[propName].info;
        if (!found) {
            var type = '';
            var kind = '';
            if (i.type) {
                type = 'USING ' + i.type;
            }
            if (i.kind) {
                // kind = i.kind;
            }

            // CREATE INDEX IF NOT EXISTS user_state ON myschema.users (state);
            if (kind && type) {
                sql.push('CREATE INDEX IF NOT EXISTS ' + propName + ' ON ' + self.escapeName(model) + ' (' + propName + ')');
            } else {
                sql.push('CREATE INDEX IF NOT EXISTS ' + propName + ' ON ' + self.escapeName(model) + ' (' + propName + ')');
            }
        }
    });
    /*
     // add multi-column indexes
     indexNames.forEach(function (indexName) {
     var i = m.settings.indexes[indexName];
     var found = ai[indexName] && ai[indexName].info;
     if (!found) {
     sql.push('CREATE INDEX IF NOT EXISTS '+indexName+' ON '+self.escapeName(model)+' ('+i.columns+')');
     }
     });
     */
    if (sql.length) {
        var query = sql;
        if (checkOnly) {
            done(null, true, {
                statements: sql,
                query: query
            });
        } else {
            var slen = query.length;
            for (var qi in query) {
                this.query(query[qi] + '', function (err, data) {
                    if (err) console.log(err);
                    if (--slen === 0) {
                        done();
                    }
                });
            }
        }
    } else {
        done();
    }

    function actualize(propName, oldSettings) {
        'use strict';
        var newSettings = m.properties[propName];
        if (newSettings && changed(newSettings, oldSettings)) {
            // ALTER TABLE users ALTER bio TYPE text;
            sql.push('ALTER TABLE ' + self.escapeName(model) + ' ALTER ' + propName + ' TYPE ' + self.propertySettingsSQL(model, propName));
        }
    }

    function changed(newSettings, oldSettings) {
        'use strict';
        var type = oldSettings.validator.replace(/ORG\.APACHE\.CASSANDRA\.DB\.MARSHAL\./gi, '');
        type = type.replace(/type/gi, '').toLowerCase();
        if (/^map/gi.test(type)) {
            type = 'map<text,text>';
        }

        switch (type) {
            case 'utf8':
                type = 'text';
                break;
            case 'int32':
                type = 'int';
                break;
            case 'long':
                type = 'bigint';
                break;
        }

        if (type !== datatype(newSettings) && type !== 'reversed(' + datatype(newSettings) + ')') {
            return true;
        }
        return false;
    }
};

Cassandra.prototype.ensureIndex = function (model, fields, params, callback) {
    'use strict';
    var self = this, sql = "", keyName = params.name || null, afld = [], kind = "";
    Object.keys(fields).forEach(function (field) {
        if (!keyName) {
            keyName = "idx_" + field;
        }
        afld.push('' + field + '');
    });
    if (params.unique) {
        kind = "UNIQUE";
    }
    // CREATE INDEX IF NOT EXISTS xi ON xx5 (x);
    sql += 'CREATE INDEX IF NOT EXISTS ' + kind + ' INDEX `' + keyName + '` ON  `' + model + '` (' + afld.join(', ') + ');';
    self.query(sql, callback);
};

Cassandra.prototype.buildLimit = function buildLimit(limit, offset) {
    'use strict';
    return 'LIMIT ' + (offset ? (offset + ', ' + limit) : limit);
};

Cassandra.prototype.buildWhere = function buildWhere(conds, adapter, model) {
    'use strict';
    var cs = [], or = [],
        self = adapter,
        props = self._models[model].properties;

    Object.keys(conds).forEach(function (key) {
        if (key !== 'or') {
            cs = parseCond(cs, key, props, conds, self);
        } else {
            conds[key].forEach(function (oconds) {
                Object.keys(oconds).forEach(function (okey) {
                    or = parseCond(or, okey, props, oconds, self);
                });
            });
        }
    });

    if (cs.length === 0 && or.length === 0) {
        return '';
    }
    var orop = "";
    if (or.length) {
        orop = ' (' + or.join(' OR ') + ') ';
    }
    orop += (orop !== "" && cs.length > 0) ? ' AND ' : '';
    return 'WHERE ' + orop + cs.join(' AND ');
};

Cassandra.prototype.buildGroupBy = function buildGroupBy(group) {
    'use strict';
    if (typeof group === 'string') {
        group = [group];
    }
    return 'GROUP BY ' + group.join(', ');
};

Cassandra.prototype.fromDatabase = function (model, data) {
    'use strict';
    if (!data) {
        return null;
    }
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key];
        if (props[key]) {
            if (props[key].type.name === 'Date' && val !== null) {
                val = new Date(val.toString().replace(/GMT.*$/, 'GMT'));
            }
        }
        data[key] = val;
    });
    return data;
};

Cassandra.prototype.propertiesSQL = function (model) {
    'use strict';
    var self = this;
    var sql = [];

    Object.keys(this._models[model].properties).forEach(function (prop) {
        if (prop === 'id') {
            return;
        }
        return sql.push('' + prop + ' ' + self.propertySettingsSQL(model, prop));
    });

    var primaryKeys = this._models[model].settings.primaryKeys || [];
    primaryKeys = primaryKeys.slice(0);
    if (primaryKeys.length) {
        for (var i = 0, length = primaryKeys.length; i < length; i++) {
            primaryKeys[i] = "" + primaryKeys[i] + "";
        }
        sql.push("PRIMARY KEY (" + primaryKeys.join(', ') + ")");
    } else {
        sql.push('id timeuuid PRIMARY KEY');
    }
    return sql.join(',\n  ');
};

Cassandra.prototype.propertySettingsSQL = function (model, prop) {
    'use strict';
    var p = this._models[model].properties[prop], field = [];
    field.push(datatype(p));
    return field.join(" ");
};

Cassandra.prototype.escapeName = function (name) {
    'use strict';
    return name.toLowerCase();
};

Cassandra.prototype.toFields = function (model, data) {
    'use strict';
    var fields = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key] && key !== 'id') {
            fields.push(key + ' = ' + this.toDatabase(props[key], data[key]));
        }
    }.bind(this));
    return fields.join(',');
};

Cassandra.prototype.toDatabase = function (prop, val) {
    'use strict';
    if (val === null) {
        return 'NULL';
    }
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            if (prop.type.name === 'Date') {
                return 'STR_TO_DATE(' + this.toDatabase(prop, val[0]) + ', "%Y-%m-%d %H:%i:%s")' +
                    ' AND STR_TO_DATE(' +
                    this.toDatabase(prop, val[1]) + ', "%Y-%m-%d %H:%i:%s")';
            } else {
                return this.toDatabase(prop, val[0]) +
                    ' AND ' +
                    this.toDatabase(prop, val[1]);
            }
        } else if (operator === 'in' || operator === 'inq' || operator === 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (var i = 0; i < val.length; i++) {
                    val[i] = this.escapeName(val[i]);
                }
                return val.join(',');
            } else {
                return val;
            }
        }
    }
    if (!prop) {
        return val;
    }
    var type = (prop.type.name || '').toLowerCase();
    if (type === 'json') {
        return val;
    }
    if (type === 'uuid' || type === 'timeuuid'
        || type === 'number' || type === 'float'
        || type === 'integer' || type === 'real') {
        return val;
    }
    if (type === 'date') {
        if (!val) {
            return 'NULL';
        }
        if (typeof val === 'string') {
            val = val.split('.')[0].replace('T', ' ');
            val = Date.parse(val);
        }
        if (typeof val === 'number') {
            val = new Date(val);
        }
        if (val instanceof Date) {
            val = val.getTime();
        }
        return val;
    }
    if (type === "boolean" || type === "tinyint") {
        return val ? 1 : 0;
    }
    return '\'' + val.toString() + '\'';
};

function dateToCassandra(val) {
    'use strict';
    return val.getUTCFullYear() + '-' +
        fillZeros(val.getUTCMonth() + 1) + '-' +
        fillZeros(val.getUTCDate()) + ' ' +
        fillZeros(val.getUTCHours()) + ':' +
        fillZeros(val.getUTCMinutes()) + ':' +
        fillZeros(val.getUTCSeconds());

    function fillZeros(v) {
        'use strict';
        return v < 10 ? '0' + v : v;
    }
}

function parseCond(cs, key, props, conds, self) {
    'use strict';
    var keyEscaped = '' + key + '';
    var val = self.toDatabase(props[key], conds[key]);
    if (conds[key] === null) {
        cs.push(keyEscaped + ' IS NULL');
    } else if (conds[key].constructor.name === 'Object') {
        Object.keys(conds[key]).forEach(function (condType) {
            val = self.toDatabase(props[key], conds[key][condType]);
            var sqlCond = keyEscaped;
            if ((condType === 'inq' || condType === 'nin') && val.length === 0) {
                cs.push(condType === 'inq' ? 0 : 1);
                return true;
            }
            switch (condType) {
                case 'gt':
                    sqlCond += ' > ';
                    break;
                case 'gte':
                    sqlCond += ' >= ';
                    break;
                case 'lt':
                    sqlCond += ' < ';
                    break;
                case 'lte':
                    sqlCond += ' <= ';
                    break;
                case 'between':
                    sqlCond += ' BETWEEN ';
                    break;
                case 'inq':
                case 'in':
                    sqlCond += ' IN ';
                    break;
                case 'nin':
                    sqlCond += ' NOT IN ';
                    break;
                case 'neq':
                case 'ne':
                    sqlCond += ' != ';
                    break;
                case 'regex':
                    sqlCond += ' REGEXP ';
                    break;
                case 'like':
                    sqlCond += ' LIKE ';
                    break;
                case 'nlike':
                    sqlCond += ' NOT LIKE ';
                    break;
                default:
                    sqlCond += ' ' + condType + ' ';
                    break;
            }
            sqlCond += (condType === 'in' || condType === 'inq' || condType === 'nin') ? '(' + val + ')' : val;
            cs.push(sqlCond);
        });

    } else if (/^\//gi.test(conds[key])) {
        var reg = val.toString().split('/');
        cs.push(keyEscaped + ' REGEXP "' + reg[1] + '"');
    } else {
        cs.push(keyEscaped + ' = ' + val);
    }
    return cs;
}

function datatype(p) {
    'use strict';
    var dt = '';
    switch ((p.type.name || 'string').toLowerCase()) {
        case 'json':
            dt = 'map<text,text>';
            break;
        case 'text':
            dt = 'text';
            break;
        case 'int':
        case 'integer':
        case 'number':
            dt = (parseFloat(p.limit) > 11) ? "bigint" : "int";
            break;
        case 'float':
        case 'double':
            dt = 'float';
        case 'real':
            dt = 'decimal';
            break;
        case 'timestamp':
        case 'date':
            dt = 'timestamp';
            break;
        case 'boolean':
        case 'bool':
            dt = 'boolean';
            break;
        case 'uuid':
        case 'timeuuid':
            dt = 'uuid';
            break;
        case 'blob':
        case 'bytes':
            dt = 'bytes';
            break;
        case 'countercolumn':
            dt = 'countercolumn';
            break;
        default:
            dt = 'text';
    }
    return dt;
}
