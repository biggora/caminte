/**
 * Module dependencies
 */
var utils = require('../utils');
var util = require('util');
var safeRequire = utils.safeRequire;
var pg = safeRequire('pg');
var BaseSQL = require('../sql');
var url = require('url');
var querystring = require('querystring');

exports.initialize = function initializeSchema(schema, callback) {
    if (!pg) {
        throw new Error('module pg is not defined, try\n  npm install pg');
    }
    var Client = pg.Client;
    var s = schema.settings;

    if (s.url) {
        var uri = url.parse(schema.settings.url);
        var query = querystring.parse(uri.query);
        s.host = uri.hostname;
        s.port = uri.port;
        s.database = uri.pathname.replace(/^\//, '');
        s.username = uri.auth && uri.auth.split(':')[0];
        s.password = uri.auth && uri.auth.split(':')[1];
        s.ssl = /(true|require)/.test(query.ssl);
    }
    s.host = s.host || 'localhost';
    s.port = parseInt(s.port || '5432', 10);
    s.database = s.database || 'test';
    s.ssl = s.ssl || false;

    schema.client = new Client(s.url ? s.url : {
        host: s.host || 'localhost',
        port: s.port || 5432,
        user: s.username || process.env.USER,
        password: s.password,
        database: s.database || process.env.USER,
        poolIdleTimeout: s.poolIdleTimeout || 5000,
        poolSize: s.poolSize || s.pool || 25,
        debug: s.debug,
        ssl: s.ssl
    });
    schema.adapter = new PG(s, schema.client);
    schema.adapter.connect(schema, callback);
};

function PG(s, client) {
    this.name = 'postgres';
    this._models = {};
    this.client = client;
    this.settings = s;
}

util.inherits(PG, BaseSQL);

PG.prototype.connect = function (schema, callback) {
    var self = this;
    createBlankDB(schema, function () {
        self.client.connect(function (err) {
            if (!err) {
                return callback && callback();
            } else {
                throw err;
            }
        });
    });
};

function createBlankDB(schema, callback) {
    var s = schema.settings;
    pg.connect({
        host: s.host || 'localhost',
        port: s.port || 5432,
        user: s.username,
        password: s.password,
        database: s.database || 'postgres',
        debug: s.debug,
        ssl: s.ssl
    }, function (err, client, done) {
        if (err) {
            console.log('Error while connecting: ' + err);
        }
        client.query('CREATE DATABASE ' + s.database + ' OWNER ' + s.username + ' ENCODING \'UTF8\'', function (err) {
            if (err) {
                // console.log(err, 'ignoring the error');
            }
            client.end();
            done();
            return callback && callback();
        });
    });
}

PG.prototype.tableEscaped = function (model) {
    return this.escapeName(this.table(model));
};

PG.prototype.query = function (sql, vals, callback) {
    var self = this, time = Date.now(), log = self.log;
    if (typeof vals === 'function') {
        callback = vals;
        vals = {};
    }
    self.client.query(sql, vals, function (err, data) {
        if (log) {
            log(time, sql);
        }
        callback(err, data ? data.rows : null);
    });
};

/**
 * Must invoke callback(err, id)
 * @param {String} model
 * @param {Object} data
 * @param {Function} callback
 */
PG.prototype.create = function (model, data, callback) {
    var fields = this.toFields(model, data, true);
    var sql = 'INSERT INTO ' + this.tableEscaped(model) + '';
    if (fields) {
        sql += ' ' + fields;
    } else {
        sql += ' VALUES ()';
    }
    sql += ' RETURNING id';

    this.query(sql, function (err, info) {
        if (err) {
            return callback && callback(err);
        }
        return callback && callback(err, info && info[0] && info[0].id);
    }.bind(this));
};

/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
PG.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parameters undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parameters undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    var self = this;
    var combined = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key] || key === 'id') {
            var k = '"' + key + '"';
            var v;
            if (key !== 'id') {
                v = self.toDatabase(props[key], data[key]);
            } else {
                v = data[key];
            }
            combined.push(k + ' = ' + v);
        }
    });

    var sql = 'UPDATE ' + self.tableEscaped(model);
    sql += ' SET ' + combined.join(', ');
    sql += ' ' + self.buildWhere(filter, self, model);
    this.query(sql, function (err, affected) {
        return callback && callback(err, affected);
    });
};

/**
 * Must invoke callback(err, data)
 * @param {String} model
 * @param {Object} filter
 * @param {Function} callback
 */
PG.prototype.all = function all(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var sql = '';
    if(filter.fields === undefined) {
        sql = 'SELECT ' + this.getColumns(model) + ' FROM ' +
            this.tableEscaped(model) + ' ' +
            this.toFilter(model, filter);
    } else {
        sql = 'SELECT ' + filter.fields + ' FROM ' +
            this.tableEscaped(model) + ' ' +
            this.toFilter(model, filter);
    }

    this.query(sql, function (err, data) {
        if (err) {
            return callback && callback(err, []);
        }
        if (filter && filter.include) {
            this._models[model].model.include(data, filter.include, callback);
        } else {
            return callback && callback(null, data);
        }
    }.bind(this));
};

/**
 * Must invoke callback(err, data)
 * @param {String} model
 * @param {Object} filter
 * @param {Function} callback
 */
PG.prototype.remove = function remove(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var sql = 'DELETE FROM ' + this.tableEscaped(model) + ' ' + this.toFilter(model, filter);
    this.query(sql, function (err, data) {
        if (err) {
            return callback && callback(err, []);
        }
        if (filter && filter.include) {
            this._models[model].model.include(data, filter.include, callback);
        } else {
            return callback && callback(null, data);
        }
    }.bind(this));
};

PG.prototype.toFields = function (model, data, forCreate) {
    var fields = [];
    var props = this._models[model].properties;

    if (forCreate) {
        var columns = [];
        Object.keys(data).forEach(function (key) {
            if (props[key]) {
                if (key === 'id') {
                    return;
                }
                columns.push('"' + key + '"');
                fields.push(this.toDatabase(props[key], data[key]));
            }
        }.bind(this));
        return '(' + columns.join(',') + ') VALUES (' + fields.join(',') + ')';
    } else {
        Object.keys(data).forEach(function (key) {
            if (props[key]) {
                if (key === 'id') {
                    return;
                }
                fields.push('"' + key + '" = ' + this.toDatabase(props[key], data[key]));
            }
        }.bind(this));
        return fields.join(',');
    }
};

function dateToPostgres(val) {
    function fz(v) {
        return v < 10 ? '0' + v : v;
    }
    return [
            val.getFullYear(),
            fz(val.getMonth() + 1),
            fz(val.getDate())
        ].join('-') + ' ' + [
            fz(val.getHours()),
            fz(val.getMinutes()),
            fz(val.getSeconds())
        ].join(':');
}

PG.prototype.toDatabase = function (prop, val) {
    if (val === null) {
        // Postgres complains with NULLs in not null columns
        // If we have an autoincrement value, return DEFAULT instead
        if (prop.autoIncrement) {
            return 'DEFAULT';
        }
        else {
            return 'NULL';
        }
    }
    var type = (prop.type.name || '').toString().toLowerCase();

    if (val.constructor.name === 'Object' && type !== 'json') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'in' || operator === 'inq' || operator === 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (var i = 0; i < val.length; i++) {
                    val[i] = escape(val[i]);
                }
                return val.join(',');
            } else {
                return val;
            }
        }
    }

    if (type === 'number') {
        if (!val && val !== 0) {
            if (prop.autoIncrement) {
                return 'DEFAULT';
            }
            else {
                return 'NULL';
            }
        }
        return val;
    }

    if (type === 'date') {
        if (!val) {
            if (prop.autoIncrement) {
                return 'DEFAULT';
            }
            else {
                return 'NULL';
            }
        }
        if (!val.toUTCString) {
            val = new Date(val);
        }
        return escape(dateToPostgres(val));
    }

    if (type === 'json') {
        return '\'' + JSON.stringify(val) + '\'';
    }

    return /^E(?:\\'|.)*?'$/gi.test(val.toString()) ? val : escape(val.toString());

};

PG.prototype.fromDatabase = function (model, data) {
    if (!data) {
        return null;
    }

    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key];
        if (props[key]) {
            if ((props[key].type.name || '').toString().toLowerCase() === 'json' && typeof val == "string") {
                try {
                    val = JSON.parse(val);
                } catch (err) {

                }
            }
            data[key] = val;
        }
    });
    return data;
};

PG.prototype.escapeName = escapeName;

PG.prototype.getColumns = function (model) {
    return '"' + Object.keys(this._models[model].properties).join('", "') + '"';
};

PG.prototype.toFilter = function (model, filter) {
    var self = this, out = '';
    if (filter && typeof filter.where === 'function') {
        return filter();
    }
    if (!filter) {
        return '';
    }

    if (filter.where) {
        out = self.buildWhere(filter.where, self, model);
    }

    if (filter.order) {
        out += self.buildOrderBy(filter.order);
    }

    if (filter.group) {
        out += self.buildGroupBy(filter.group);
    }

    if (filter.limit) {
        out += self.buildLimit(filter.limit, (filter.offset || filter.skip || '0'));
    }

    return out;
};

PG.prototype.autoupdate = function (callback) {
    var self = this, wait = 0;
    Object.keys(self._models).forEach(function (model) {
        wait += 1;
        var indexes = [];
        var sql = 'SELECT column_name as "Field", udt_name as "Type", ' +
            'is_nullable as "Null", column_default as "Default" ' +
            'FROM information_schema.COLUMNS WHERE table_name = "' + self.table(model) + '"';
        self.client.query(sql, function (err, fields) {
            if(err){
                // console.log('autoupdate err', wait, err.message, sql);
                return done && done();
            }
            if (!err && fields.length) {
                fields.forEach(function (field) {
                    field.Type = mapPostgresDatatypes(field.Type);
                });
                self.alterTable(model, fields, indexes, done);
            } else {
                self.createTable(model, indexes, done);
            }
        });
    });

    function done(err) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0) {
            return callback && callback();
        }
    }
};

PG.prototype.isActual = function (cb) {
    var self = this;
    var wait = 0;
    var changes = [];
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        getTableStatus.call(self, model, function (err, fields) {
            changes = changes.concat(getPendingChanges.call(self, model, fields));
            done(err, changes);
        });
    });

    function done(err) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0 && cb) {
            var actual = (changes.length === 0);
            return cb && cb(null, actual);
        }
    }
};

PG.prototype.alterTable = function (model, actualFields, indexes, done) {
    var self = this;
    var pendingChanges = getPendingChanges.call(self, model, actualFields);
    applySqlChanges.call(self, model, pendingChanges, done);
};

function getPendingChanges(model, actualFields) {
    var sql = [], self = this;
    sql = sql.concat(getColumnsToAdd.call(self, model, actualFields));
    sql = sql.concat(getPropertiesToModify.call(self, model, actualFields));
    sql = sql.concat(getColumnsToDrop.call(self, model, actualFields));
    return sql;
}

function getColumnsToAdd(model, actualFields) {
    var self = this;
    var m = self._models[model];
    var propNames = Object.keys(m.properties);
    var sql = [];
    propNames.forEach(function (propName) {
        if (propName === 'id')
            return;
        var found = searchForPropertyInActual.call(self, propName, actualFields);
        if (!found && propertyHasNotBeenDeleted.call(self, model, propName)) {
            sql.push(addPropertyToActual.call(self, model, propName));
        }
    });
    return sql;
}

function addPropertyToActual(model, propName) {
    var self = this, p = self._models[model].properties[propName];
    var sqlCommand = 'ADD COLUMN "' + propName + '" ' + datatype(p) + " " + (propertyCanBeNull.call(self, model, propName) ? "" : " NOT NULL");
    return sqlCommand;
}

function searchForPropertyInActual(propName, actualFields) {
    var found = false;
    actualFields.forEach(function (f) {
        if (f.Field === propName) {
            found = f;
            return;
        }
    });
    return found;
}

function getPropertiesToModify(model, actualFields) {
    var self = this, sql = [], found, m = self._models[model];
    var propNames = Object.keys(m.properties);
    propNames.forEach(function (propName) {
        if (propName === 'id')
            return;
        found = searchForPropertyInActual.call(self, propName, actualFields);
        if (found && propertyHasNotBeenDeleted.call(self, model, propName)) {
            if (datatypeChanged(propName, found)) {
                sql.push(modifyDatatypeInActual.call(self, model, propName));
            }
            if (nullabilityChanged(propName, found)) {
                sql.push(modifyNullabilityInActual.call(self, model, propName));
            }
        }
    });

    function datatypeChanged(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (!newSettings) {
            return false;
        }
        return oldSettings.Type.toLowerCase() !== datatype(newSettings);
    }

    function nullabilityChanged(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (!newSettings)
            return false;
        var changed = false;
        if (oldSettings.Null === 'YES' && (newSettings.allowNull === false || newSettings.null === false))
            changed = true;
        if (oldSettings.Null === 'NO' && !(newSettings.allowNull === false || newSettings.null === false))
            changed = true;
        return changed;
    }
    return sql;
}

function modifyDatatypeInActual(model, propName) {
    var self = this;
    var sqlCommand = 'ALTER COLUMN "' + propName + '"  TYPE ' + datatype(self._models[model].properties[propName]);
    return sqlCommand;
}

function modifyNullabilityInActual(model, propName) {
    var self = this, sqlCommand = 'ALTER COLUMN "' + propName + '" ';
    if (propertyCanBeNull.call(self, model, propName)) {
        sqlCommand = sqlCommand + "DROP ";
    } else {
        sqlCommand = sqlCommand + "SET ";
    }
    sqlCommand = sqlCommand + "NOT NULL";
    return sqlCommand;
}

function getColumnsToDrop(model, actualFields) {
    var self = this, sql = [];
    actualFields.forEach(function (actualField) {
        if (actualField.Field === 'id') {
            return;
        }
        if (actualFieldNotPresentInModel(actualField, model)) {
            sql.push('DROP COLUMN "' + actualField.Field + '"');
        }
    });

    function actualFieldNotPresentInModel(actualField, model) {
        return !(self._models[model].properties[actualField.Field]);
    }

    return sql;
}

function applySqlChanges(model, pendingChanges, done) {
    var self = this;
    if (pendingChanges.length) {
        var thisQuery = 'ALTER TABLE ' + self.tableEscaped(model);
        var ranOnce = false;
        pendingChanges.forEach(function (change) {
            if (ranOnce)
                thisQuery = thisQuery + ',';
            thisQuery = thisQuery + ' ' + change;
            ranOnce = true;
        });
        thisQuery = thisQuery + ';';
        self.query(thisQuery, callback);
    } else {
        return done && done();
    }

    function callback(err) {
        if (err) {
            console.log(err);
        }
        return done && done();
    }
}

function getTableStatus(model, done) {
    function decoratedCallback(err, data) {
        data.forEach(function(field) {
            field.Type = mapPostgresDatatypes(field.Type);
        });
        return done && done(err, data);
    }
    this.query('SELECT column_name as "Field", udt_name as "Type", ' +
        'is_nullable as "Null", column_default as "Default" ' +
        'FROM information_schema.COLUMNS WHERE table_name = \'' + this.table(model) + '\'', decoratedCallback);
}

PG.prototype.propertiesSQL = function (model) {
    var self = this, sql = ['"id" SERIAL PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function (prop) {
        if (prop === 'id') {
            return;
        }
        sql.push('"' + prop + '" ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');
};

PG.prototype.propertySettingsSQL = function (model, propName) {
    var self = this, p = self._models[model].properties[propName];
    var result = datatype(p) + ' ';
    if (!propertyCanBeNull.call(self, model, propName)) {
        result = result + 'NOT NULL ';
    }
    return result;
};

function propertyCanBeNull(model, propName) {
    var p = this._models[model].properties[propName];
    return !(p.allowNull === false || p['null'] === false);
}

function escape(val) {
    if (val === undefined || val === null) {
        return 'NULL';
    }

    switch (typeof val) {
        case 'boolean':
            return (val) ? 'true' : 'false';
        case 'number':
            return val + '';
    }

    if (typeof val === 'object') {
        val = (typeof val.toISOString === 'function')
            ? val.toISOString()
            : val.toString();
    }

    val = val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function (s) {
        switch (s) {
            case "\0":
                return "\\0";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\b":
                return "\\b";
            case "\t":
                return "\\t";
            case "\x1a":
                return "\\Z";
            default:
                return "\\" + s;
        }
    });
    return "E'" + val + "'";
}


function datatype(p) {
    switch ((p.type.name || 'string').toLowerCase()) {
        default:
        case 'string':
        case 'varchar':
            return 'varchar';
        case 'json':
            return 'json';
        case 'text':
            return 'text';
        case 'int':
        case 'integer':
        case 'number':
            return 'integer';
        case 'real':
            return 'real';
        case 'float':
        case 'double':
            return 'double precision';
        case 'date':
            return 'timestamp';
        case 'boolean':
            return 'boolean';
    }
}

function mapPostgresDatatypes(typeName) {
    //TODO there are a lot of synonymous type names that should go here-- this is just what i've run into so far
    switch (typeName) {
        case 'int4':
            return 'integer';
        case 'bool':
            return 'boolean';
        default:
            return typeName;
    }
}

function propertyHasNotBeenDeleted(model, propName) {
    return !!this._models[model].properties[propName];
}

PG.prototype.buildWhere = function buildWhere(conds, adapter, model) {
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

function parseCond(cs, key, props, conds, self) {
    var keyEscaped = escapeName(key);
    var val = self.toDatabase(props[key], conds[key]);
    if (conds[key] === null) {
        cs.push(keyEscaped + ' IS NULL');
    } else if (conds[key].constructor.name === 'Object') {
        Object.keys(conds[key]).forEach(function (condType) {
            var inq = 'in,inq,nin'.indexOf(condType) > -1 ? 1 : 0;
            val = self.toDatabase(props[key], conds[key][condType]);
            var sqlCond = keyEscaped;
            if (inq === 1 && val.length === 0) {
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
            if (condType === 'between') {
                sqlCond += val[0] + ' AND ' + val[1];
            } else if (inq === 1) {
                sqlCond += '(' + val + ')';
            } else {
                sqlCond += val;
            }
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

PG.prototype.buildOrderBy = function buildOrderBy(order) {
    if (typeof order === 'string') {
        order = [order];
    }
    return ' ORDER BY ' + order.join(', ');
};

PG.prototype.buildLimit = function buildLimit(limit, offset) {
    return ' LIMIT ' + limit + ' OFFSET ' + (offset || '0');
};

PG.prototype.buildGroupBy = function buildGroupBy(group) {
    if (typeof group === 'string') {
        group = [group];
    }
    return ' GROUP BY ' + group.join(', ');
};

function escapeName(name) {
    return '"' + name.replace(/\./g, '"."') + '"';
}
