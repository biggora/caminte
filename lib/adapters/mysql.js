/**
 * Module dependencies
 */
var safeRequire = require('../utils').safeRequire;
var mysql = safeRequire('mysql');
var BaseSQL = require('../sql');

exports.initialize = function initializeSchema(schema, callback) {
    if (!mysql) {
        return;
    }
    var s = schema.settings;
    var conSettings = {
        host: s.host || 'localhost',
        port: s.port || 3306,
        user: s.username,
        password: s.password,
        debug: s.debug
    };
    var dbName = s.database;

    if (s.pool) {
        schema.client = mysql.createPool(conSettings);
        schema.client.getConnection(function (err, connection) {
            if (err) {
                throw new Error(err);
            }
        });
        schema.adapter = new MySQL(schema.client, conSettings);
        schema.adapter.schema = schema;
        schema.client.once('connection', function (connection) {
            startAdapter(schema, dbName, callback);
        });
    } else {
        schema.client = mysql.createConnection(conSettings);
        schema.adapter = new MySQL(schema.client, conSettings);
        schema.adapter.schema = schema;
        startAdapter(schema, dbName, callback);
    }
};

function startAdapter(schema, dbName, callback) {
    schema.client.query('USE `' + dbName + '`', function (err) {
        if (err && err.message.match(/^unknown database/i)) {
            schema.client.query('CREATE DATABASE ' + dbName, function (error) {
                if (!error) {
                    schema.client.query('USE ' + dbName, callback);
                } else {
                    throw error;
                }
            });
        } else {
            callback();
        }
    });
}

/**
 * MySQL adapter
 * @param {Object} client
 * @param {Object} conSettings
 */
function MySQL(client, conSettings) {
    this._models = {};
    this.log = console.log;
    this.client = client;
    this.settings = conSettings;
}

require('util').inherits(MySQL, BaseSQL);

MySQL.prototype.query = function (sql, callback) {
    var self = this;
    var client = self.client;
    var log = self.log || console.log;
    if (typeof callback !== 'function') {
        throw new Error('callback should be a function');
    }
    client.query(sql, function (err, data) {
        if (log) {
            // log(new Date().toISOString(), '###', sql, err);
        }
        if (err && err.message.match(/^unknown database/i)) {
            var dbName = err.message.match(/^unknown database '(.*?)'/i)[1];
            client.query('CREATE DATABASE ' + dbName, function (error) {
                if (!error) {
                    client.query(sql, callback);
                } else {
                    callback(err);
                }
            });
        } else if (err && (err.message.match(/No\s+database\s+selected/gi) || parseInt(err.errno) === 1046)) {
            client.query('USE `' + self.schema.settings.database + '`', function (error) {
                if (!error) {
                    client.query(sql, callback);
                } else {
                    callback(error);
                }
            });
        } else {
            return callback(err, data);
        }
    });
};

/**
 * Start transaction callback(err, id)
 * @param {Object} params
 * @param {Function} callback
 */
MySQL.prototype.begin = function (params, callback) {
    if ('function' === typeof params) {
        callback = params;
        params = null;
    }
    this.query('START TRANSACTION', callback);
};

/**
 * Commit transaction callback(err, id)
 * @param {Object} params
 * @param {Function} callback
 */
MySQL.prototype.commit = function (params, callback) {
    if ('function' === typeof params) {
        callback = params;
        params = null;
    }
    this.query('COMMIT', callback);
};

/**
 * Rollback transaction callback(err, id)
 * @param {Object} params
 * @param {Function} callback
 */
MySQL.prototype.rollback = function (params, callback) {
    if ('function' === typeof params) {
        callback = params;
        params = null;
    }
    this.query('ROLLBACK', callback);
};

/**
 * Create multi column index callback(err, id)
 * @param {Object} model
 * @param {Object} fields
 * @param {Object} params
 * @param {Function} callback
 */
MySQL.prototype.ensureIndex = function (model, fields, params, callback) {
    var self = this, sql = "", keyName = params.name || null, afld = [], kind = "";
    Object.keys(fields).forEach(function (field) {
        if (!keyName) {
            keyName = "idx_" + field;
        }
        afld.push('`' + field + '`');
    });
    if (params.unique) {
        kind = "UNIQUE";
    }
    // sql = 'USE `' + self.schema.settings.database + '`; ';
    sql += 'ALTER TABLE `' + model + '` ADD ' + kind + ' INDEX `' + keyName + '` (' + afld.join(', ') + ');';
    self.query(sql, callback);
};

/**
 * Must invoke callback(err, id)
 * @param {Object} model
 * @param {Object} data
 * @param {Function} callback
 */
MySQL.prototype.create = function (model, data, callback) {
    var fields = this.toFields(model, data);
    var sql = 'INSERT INTO ' + this.tableEscaped(model);

    if (fields) {
        sql += ' SET ' + fields;
    } else {
        sql += ' VALUES ()';
    }
    this.query(sql, function (err, info) {
        callback(err, info && info.insertId);
    });
};

MySQL.prototype.updateOrCreate = function (model, data, callback) {
    var mysql = this;
    var fieldsNames = [];
    var fieldValues = [];
    var combined = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key] || key === 'id') {
            var k = '`' + key + '`';
            var v;
            if (key !== 'id') {
                v = mysql.toDatabase(props[key], data[key]);
            } else {
                v = data[key];
            }
            fieldsNames.push(k);
            fieldValues.push(v);
            if (key !== 'id')
                combined.push(k + ' = ' + v);
        }
    });

    var sql = 'INSERT INTO ' + this.tableEscaped(model);
    sql += ' (' + fieldsNames.join(', ') + ')';
    sql += ' VALUES (' + fieldValues.join(', ') + ')';
    sql += ' ON DUPLICATE KEY UPDATE ' + combined.join(', ');

    this.query(sql, function (err, info) {
        if (!err && info && info.insertId) {
            data.id = info.insertId;
        }
        callback(err, data);
    });
};
/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
MySQL.prototype.update = function (model, filter, data, callback) {
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
            var k = '`' + key + '`';
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
        callback(err, ((affected || {}).affectedRows || affected));
    });
};

MySQL.prototype.toFields = function (model, data) {
    var fields = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key]) {
            fields.push('`' + key.replace(/\./g, '`.`') + '` = ' + this.toDatabase(props[key], data[key]));
        }
    }.bind(this));
    return fields.join(',');
};

function dateToMysql(val) {
    return val.getUTCFullYear() + '-' +
        fillZeros(val.getUTCMonth() + 1) + '-' +
        fillZeros(val.getUTCDate()) + ' ' +
        fillZeros(val.getUTCHours()) + ':' +
        fillZeros(val.getUTCMinutes()) + ':' +
        fillZeros(val.getUTCSeconds());

    function fillZeros(v) {
        return v < 10 ? '0' + v : v;
    }
}

MySQL.prototype.toDatabase = function (prop, val) {
    if (val === null) {
        return 'NULL';
    }
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            if (prop.type.name === 'Date') {
                return  'STR_TO_DATE(' + this.toDatabase(prop, val[0]) + ', "%Y-%m-%d %H:%i:%s")' +
                    ' AND STR_TO_DATE(' +
                    this.toDatabase(prop, val[1]) + ', "%Y-%m-%d %H:%i:%s")';
            } else {
                return  this.toDatabase(prop, val[0]) +
                    ' AND ' +
                    this.toDatabase(prop, val[1]);
            }
        } else if (operator === 'in' || operator === 'inq' || operator === 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (var i = 0; i < val.length; i++) {
                    val[i] = this.client.escape(val[i]);
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
    if (prop.type.name === 'Number') {
        return val;
    }
    if (prop.type.name === 'Date') {
        if (!val)
            return 'NULL';
        if (!val.toUTCString) {
            val = new Date(val);
        }
        return '"' + dateToMysql(val) + '"';
    }
    if (prop.type.name === "Boolean") {
        return val ? 1 : 0;
    }
    return this.client.escape(val.toString());
};

MySQL.prototype.fromDatabase = function (model, data) {
    if (!data)
        return null;
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

MySQL.prototype.escapeName = function (name) {
    return '`' + name.replace(/\./g, '`.`') + '`';
};

MySQL.prototype.all = function all(model, filter, callback) {
    var self = this;
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var sql = 'SELECT * FROM ' + this.tableEscaped(model);
    var self = this;

    if (filter) {

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

MySQL.prototype.autoupdate = function (cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.query('SHOW FIELDS FROM ' + self.tableEscaped(model), function (err, fields) {
            self.query('SHOW INDEXES FROM ' + self.tableEscaped(model), function (err, indexes) {
                if (!err && fields.length) {
                    self.alterTable(model, fields, indexes, done);
                } else {
                    self.createTable(model, indexes, done);
                }
            });
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

MySQL.prototype.isActual = function (cb) {
    var ok = false;
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.query('SHOW FIELDS FROM ' + model, function (err, fields) {
            self.query('SHOW INDEXES FROM ' + model, function (err, indexes) {
                self.alterTable(model, fields, indexes, done, true);
            });
        });
    });

    function done(err, needAlter) {
        if (err) {
            console.log(err);
        }
        ok = ok || needAlter;
        if (--wait === 0 && cb) {
            cb(null, !ok);
        }
    }
};

MySQL.prototype.alterTable = function (model, actualFields, actualIndexes, done, checkOnly) {
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
            var name = i.Key_name;
            if (!ai[name]) {
                ai[name] = {
                    info: i,
                    columns: []
                };
            }
            ai[name].columns[i.Seq_in_index - 1] = i.Column_name;
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
            if (f.Field === propName) {
                found = f;
            }
        });

        if (found) {
            actualize(propName, found);
        } else {
            sql.push('ADD COLUMN `' + propName + '` ' + self.propertySettingsSQL(model, propName));
        }
    });

    // drop columns
    actualFields.forEach(function (f) {
        var notFound = !~propNames.indexOf(f.Field);
        if (f.Field === 'id') {
            return;
        }
        if (notFound || !m.properties[f.Field]) {
            sql.push('DROP COLUMN `' + f.Field + '` ');
        }
    });

    // remove indexes
    aiNames.forEach(function (indexName) {
        if (indexName === 'id' || indexName === 'PRIMARY') {
            return;
        }
        if (indexNames.indexOf(indexName) === -1 && !m.properties[indexName] || m.properties[indexName] && !m.properties[indexName].index) {
            sql.push('DROP INDEX `' + indexName + '`');
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
                sql.push('DROP INDEX `' + indexName + '`');
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
            if (kind && type) {
                sql.push('ADD ' + kind + ' INDEX `' + propName + '` (`' + propName + '`) ' + type);
            } else {
                sql.push('ADD ' + kind + ' INDEX `' + propName + '` ' + type + ' (`' + propName + '`) ');
            }
        }
    });

    // add multi-column indexes
    indexNames.forEach(function (indexName) {
        var i = m.settings.indexes[indexName];
        var found = ai[indexName] && ai[indexName].info;
        if (!found) {
            var type = '';
            var kind = '';
            if (i.type) {
                type = 'USING ' + i.kind;
            }
            if (i.kind) {
                kind = i.kind;
            }
            if (kind && type) {
                sql.push('ADD ' + kind + ' INDEX `' + indexName + '` (' + i.columns + ') ' + type);
            } else {
                sql.push('ADD ' + kind + ' INDEX ' + type + ' `' + indexName + '` (' + i.columns + ')');
            }
        }
    });

    if (sql.length) {
        var query = 'ALTER TABLE ' + self.tableEscaped(model) + ' ' + sql.join(',\n');
        if (checkOnly) {
            done(null, true, {
                statements: sql,
                query: query
            });
        } else {
            this.query(query, done);
        }
    } else {
        done();
    }

    function actualize(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (newSettings && changed(newSettings, oldSettings)) {
            sql.push('CHANGE COLUMN `' + propName + '` `' + propName + '` ' + self.propertySettingsSQL(model, propName));
        }
    }

    function changed(newSettings, oldSettings) {
        if (oldSettings.Null === 'YES' && (newSettings.allowNull === false || newSettings.null === false)) {
            return true;
        }
        if (oldSettings.Null === 'NO' && (getDefaultValue(newSettings) !== getDefaultValue(oldSettings))) {
            return true;
        }
        if (oldSettings.Type.toUpperCase() !== datatype(newSettings)) {
            return true;
        }
        return false;
    }
};

MySQL.prototype.propertiesSQL = function (model) {
    var self = this;
    var sql = ['`id` INT(11) NOT NULL AUTO_INCREMENT UNIQUE PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function (prop) {
        if (prop === 'id') {
            return;
        }
        return sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');
};

MySQL.prototype.propertySettingsSQL = function (model, prop) {
    var p = this._models[model].properties[prop], field = [];
    field.push(datatype(p));
    field.push(p.allowNull === false || (typeof p['default'] !== 'undefined' && acceptedDefaults(p)) ? 'NOT NULL' : 'NULL');
    if (typeof p['default'] !== 'undefined' && acceptedDefaults(p) && typeof p['default'] !== 'function') {
        field.push('DEFAULT ' + getDefaultValue(p));
    }
    return field.join(" ");
};

function datatype(p) {
    var dt = '';
    switch ((p.type.name || 'string').toLowerCase()) {
        case 'string':
        case 'varchar':
            dt = 'VARCHAR(' + (p.limit || 255) + ')';
            break;
        case 'json':
        case 'text':
            dt = 'TEXT';
            break;
        case 'number':
            var ftype = (parseFloat(p.limit) > 11) ? "BIGINT" : "INT";
            dt = ftype + '(' + (p.limit || 11) + ')';
            break;
        case 'date':
            dt = 'DATETIME';
            break;
        case 'boolean':
        case 'bool':
            dt = 'TINYINT(' + (p.limit || 1) + ')';
            break;
        default:
            dt = 'VARCHAR(' + (p.limit || 255) + ')';
    }
    return dt;
}

MySQL.prototype.buildWhere = function buildWhere(conds, adapter, model) {
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
    var keyEscaped = '`' + key.replace(/\./g, '`.`') + '`';
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

MySQL.prototype.buildOrderBy = function buildOrderBy(order) {
    if (typeof order === 'string') {
        order = [order];
    }
    return 'ORDER BY ' + order.join(', ');
};

MySQL.prototype.buildLimit = function buildLimit(limit, offset) {
    return 'LIMIT ' + (offset ? (offset + ', ' + limit) : limit);
};

MySQL.prototype.buildGroupBy = function buildGroupBy(group) {
    if (typeof group === 'string') {
        group = [group];
    }
    return 'GROUP BY ' + group.join(', ');
};

function acceptedDefaults(prop) {
    if (/^INT|^BIGINT|^VAR|^TINY/i.test(datatype(prop))) {
        return true;
    } else {
        return false;
    }
}

function getDefaultValue(prop) {
    if (/^INT|^BIGINT/i.test(prop.Type || datatype(prop))) {
        return parseInt(prop['default'] || prop['Default'] || 0);
    } else if (/^TINY/i.test(prop.Type || datatype(prop))) {
        return prop['default'] || prop['Default'] ? 1 : 0;
    } else {
        return "'" + (prop['default'] || prop['Default']) + "'";
    }
}