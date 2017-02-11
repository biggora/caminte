/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var sqlite3 = safeRequire('sqlite3');
var util = require('util');
var BaseSQL = require('../sql');

exports.initialize = function initializeSchema(schema, callback) {
    if (!sqlite3) {
        return;
    }
    var s = schema.settings;
    var Database = sqlite3.verbose().Database;
    var db = new Database(s.database);

    schema.client = db;
    schema.adapter = new SQLite3(schema, schema.client);
    schema.client.run('PRAGMA encoding = "UTF-8"', function () {
        if (s.database === ':memory:') {
            schema.adapter.automigrate(callback);
        } else {
            process.nextTick(callback);
        }
    });
};

function SQLite3(schema, client) {
    this.name = 'sqlite3';
    this._models = {};
    this.client = client;
    this.schema = schema;
}

util.inherits(SQLite3, BaseSQL);

SQLite3.prototype.query = function (sql, callback) {
    this.queryAll(sql, callback);
};

SQLite3.prototype.command = function () {
    this.run('run', [].slice.call(arguments));
};

SQLite3.prototype.execSql = function () {
    this.run('exec', [].slice.call(arguments));
};

SQLite3.prototype.queryAll = function () {
    this.run('all', [].slice.call(arguments));
};

SQLite3.prototype.queryOne = function () {
    this.run('get', [].slice.call(arguments));
};

SQLite3.prototype.run = function (method, args) {
    var time = Date.now();
    var log = this.log;
    var cb = args.pop();
    if (typeof cb === 'function') {
        args.push(function (err, data) {
            if (log)
                log(args[0], time);
            cb.call(this, err, data);
        });
    } else {
        args.push(cb);
        args.push(function (err, data) {
            log(args[0], time);
        });
    }
    this.client[method].apply(this.client, args);
};

SQLite3.prototype.save = function (model, data, callback) {
    var queryParams = [];
    var sql = 'UPDATE ' + this.tableEscaped(model) + ' SET ' +
        Object.keys(data).map(function (key) {
            queryParams.push(data[key]);
            return key + ' = ?';
        }).join(', ') + ' WHERE id = ' + data.id;
    this.command(sql, queryParams, function (err) {
        callback(err);
    });
};

/**
 * Must invoke callback(err, id)
 * @param {Object} model
 * @param {Object} data
 * @param {Function} callback
 */
SQLite3.prototype.create = function (model, data, callback) {
    data = data || {};
    var questions = [];
    var values = Object.keys(data).map(function (key) {
        questions.push('?');
        return data[key];
    });
    var sql = 'INSERT INTO ' + this.tableEscaped(model) + ' (' + Object.keys(data).join(',') + ') VALUES (';
    sql += questions.join(',');
    sql += ')';
    this.command(sql, values, function (err) {
        callback(err, this && this.lastID);
    });
};

SQLite3.prototype.updateOrCreate = function (model, filter, data, callback) {
    filter = filter || {};
    var self = this, Model = self._models[model].model;
    self.all(model, {where: filter}, function (err, found) {
        if (err || (found && found.length > 1)) {
            return callback(err || new Error("Found multiple instances"));
        }
        if (found && found.length === 1) {
            var inst = self.fromDatabase(model, found[0]);
            var obj = new Model();
            obj._initProperties(inst, false);
            obj.updateAttributes(data, function (err) {
                callback(err, obj);
            });
        } else {
            Object.keys(filter).forEach(function (key) {
                data[key] = filter[key];
            });
            self.create(model, data, callback)
        }
    });
};
/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
SQLite3.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    var self = this;
    var combined = [];
    var queryParams = [];
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

    var sql = 'UPDATE ' + self.tableEscaped(model);
    sql += ' SET ' + combined.join(', ');
    sql += ' ' + self.buildWhere(filter, self, model);
    self.command(sql, queryParams, function (err, affected) {
        return callback && callback(err, affected || 0);
    });
};

SQLite3.prototype.toFields = function (model, data) {
    var self = this, fields = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key]) {
            fields.push('`' + key.replace(/\./g, '`.`') + '` = ' + self.toDatabase(props[key], data[key]));
        }
    }.bind(self));
    return fields.join(',');
};

SQLite3.prototype.toDatabase = function (prop, val) {
    if (val === null || val === undefined) {
        return 'NULL';
    }
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            if (prop.type.name === 'Date') {
                return 'strftime(' + this.toDatabase(prop, val[0]) + ')' +
                    ' AND strftime(' +
                    this.toDatabase(prop, val[1]) + ')';
            } else {
                return this.toDatabase(prop, val[0]) +
                    ' AND ' +
                    this.toDatabase(prop, val[1]);
            }
        } else if (operator === 'in' || operator === 'inq' || operator === 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                for (var i = 0; i < val.length; i++) {
                    val[i] = this.escape(val[i]);
                }
                return val.join(',');
            } else {
                return val;
            }
        }
    }
    if (!prop)
        return val;
    if (prop.type.name === 'Number' || prop.type.name === 'Integer' || prop.type.name === 'Real')
        return val;
    if (prop.type.name === 'Date') {
        if (!val) {
            return 'NULL';
        }
        if (!val.toUTCString) {
            val = new Date(val).getTime();
        } else if (val.getTime) {
            val = val.getTime();
        }
        return val;
    }
    if (prop.type.name === "Boolean") {
        return val ? 1 : 0;
    }
    val = val.toString();
    return /^"(?:\\"|.)*?"$/gi.test(val) ? val : this.escape(val);
};

SQLite3.prototype.fromDatabase = function (model, data) {
    var self = this;
    if (!data) {
        return null;
    }
    var props = self._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key], type = (props[key].type.name || '').toString().toLowerCase();
        if (props[key]) {
            if (type === 'json' && typeof val == "string") {
                if ((props[key].type.name || '').toString().toLowerCase() === 'json' && typeof val == "string") {
                    try {
                        data[key] = JSON.parse(val);
                    } catch (err) {
                        data[key] = val;
                    }
                }
            } else if (type === 'date') {
                if (!val) {
                    val = null;
                }
                if (typeof val === 'string') {
                    val = val.split('.')[0].replace('T', ' ');
                    val = Date.parse(val);
                }
                if (typeof val === 'number') {
                    val = new Date(val);
                }

                data[key] = val;
            } else {
                data[key] = val;
            }
        }
    });
    return data;
};

SQLite3.prototype.escape = function (val) {
    return typeof val === 'string' ? '"' + val + '"' : val;
};

SQLite3.prototype.escapeName = function (name) {
    return '`' + name + '`';
};

SQLite3.prototype.exists = function (model, id, callback) {
    var sql = 'SELECT 1 FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function (err, data) {
        if (err) {
            return callback(err);
        }
        callback(null, data && data['1'] === 1);
    });
};

SQLite3.prototype.findById = function findById(model, id, callback) {
    var sql = 'SELECT * FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function (err, data) {
        if (data) {
            data.id = id;
        } else {
            data = null;
        }
        callback(err, this.fromDatabase(model, data));
    }.bind(this));
};

SQLite3.prototype.all = function all(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }

    var sql = 'SELECT * FROM ' + this.tableEscaped(model);
    var self = this, queryParams = [];

    if (filter) {
        if (filter.where) {
            sql += ' ' + this.buildWhere(filter.where, self, model);
        }
        if (filter.order) {
            sql += ' ' + this.buildOrderBy(filter.order);
        }

        if (filter.group) {
            sql += ' ' + self.buildGroupBy(filter.group);
        }

        if (filter.limit) {
            sql += ' ' + this.buildLimit(filter.limit, filter.offset || filter.skip || 0);
        }
    }
    self.queryAll(sql, function (err, data) {
        if (err) {
            return callback(err, []);
        }
        data = data.map(function (obj) {
            return self.fromDatabase(model, obj);
        }.bind(self));
        return callback && callback(null, data);
    }.bind(self));
};

SQLite3.prototype.disconnect = function disconnect() {
    this.client.close();
};

SQLite3.prototype.autoupdate = function (cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.queryAll('PRAGMA TABLE_INFO(' + self.tableEscaped(model) + ');', function (err, fields) {
            if (err) done(err);
            self.queryAll('PRAGMA INDEX_LIST(' + self.tableEscaped(model) + ');', function (err, indexes) {
                if (err) done(err);
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
            cb(err);
        }
    }
};

SQLite3.prototype.isActual = function (cb) {
    var ok = false;
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.queryAll('PRAGMA TABLE_INFO(' + self.tableEscaped(model) + ')', function (err, fields) {
            self.queryAll('PRAGMA INDEX_LIST(' + self.tableEscaped(model) + ')', function (err, indexes) {
                if (!err && fields.length) {
                    self.alterTable(model, fields, indexes, done, true);
                }
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

SQLite3.prototype.alterTable = function (model, actualFields, indexes, done, checkOnly) {
    var self = this, m = self._models[model];
    var defIndexes = m.settings.indexes;
    var propNames = Object.keys(m.properties);
    var sql = [], isql = [], reBuild = false;

    // change/add new fields
    propNames.forEach(function (propName) {
        if (propName === 'id') {
            return;
        }
        var found;
        actualFields.forEach(function (f) {
            if (f.name === propName) {
                found = f;
            }
        });
        if (found) {
            actualize(propName, found);
        } else {
            if (m.properties[propName] !== false) {
                sql.push('ADD COLUMN `' + propName + '` ' + self.propertySettingsSQL(model, propName));
            }
        }
    });

    // drop columns
    actualFields.forEach(function (f) {
        var notFound = !~propNames.indexOf(f.name);
        if (f.name === 'id') {
            return;
        }
        if (notFound || !m.properties[f.name]) {
            reBuild = true;
        }
    });

    for (var fieldName in m.properties) {
        var idx = m.properties[fieldName];
        if ('undefined' !== typeof idx['index']
            || 'undefined' !== typeof idx['unique']) {
            var foundKey = false, UNIQ = '',
                kuniq = !idx['unique'] ? 0 : idx['unique'],
                ikey = (model + '_' + fieldName).toString();
            kuniq = kuniq === false ? 0 : 1;
            if (idx['index'] !== false) {
                indexes.forEach(function (index) {
                    if (ikey === index.name) {
                        if (index.unique !== kuniq) {
                            UNIQ = kuniq === 1 ? ' UNIQUE ' : '';
                            isql.push('DROP INDEX `' + ikey + '`;');
                            // isql.push('CREATE ' + UNIQ + ' INDEX `' + ikey + '` ON ' + self.tableEscaped(model) + ' (`' + fieldName + '` ASC);');
                            reBuild = true;
                        }
                        foundKey = index.name;
                    }
                });

                if (!foundKey) {
                    UNIQ = 'undefined' !== typeof m.properties[fieldName]['unique'] ? ' UNIQUE ' : '';
                    isql.push('CREATE ' + UNIQ + ' INDEX `' + ikey + '` ON ' + self.tableEscaped(model) + ' (`' + fieldName + '` ASC);');
                }
            } else {
                reBuild = true;
            }
        }
    }

    if (defIndexes) {
        for (var fieldName in defIndexes) {
            var foundKey = false, ikey = (model + '_' + fieldName).toString();
            indexes.forEach(function (index) {
                if (ikey === index.name) {
                    foundKey = index.name;
                }
            });

            if (!foundKey) {
                var fields = [], columns = defIndexes[fieldName]['columns'] || [];
                if (Object.prototype.toString.call(columns) === '[object Array]') {
                    fields = columns;
                } else if (typeof columns === 'string') {
                    columns = (columns || '').replace(/,/g,' ').split(/\s+/);
                }
                if (columns.length) {
                    columns = columns.map(function (column) {
                        return '`'+column.replace(/,/g,'') + '` ASC';
                    });
                    var UNIQ = 'undefined' !== typeof defIndexes[fieldName]['unique'] ? ' UNIQUE ' : '';
                    isql.push('CREATE ' + UNIQ + ' INDEX `' + ikey + '` ON ' + self.tableEscaped(model) + ' (' + columns.join(',') + ');');
                }
            }
        }
    }

    var tSql = [];
    if (sql.length) {
        tSql.push('ALTER TABLE ' + self.tableEscaped(model) + ' ' + sql.join(',\n'));
    }
    if (isql.length) {
        tSql = tSql.concat(isql);
    }

    if (tSql.length) {
        if (checkOnly) {
            return done(null, true, {
                statements: tSql,
                query: ''
            });
        } else {
            var tlen = tSql.length;
            tSql.forEach(function (tsql) {
                return self.command(tsql, function (err) {
                    if (err) console.log(err, tsql);
                    if (--tlen === 0) {
                        if (reBuild) {
                            return rebuid(model, m.properties, actualFields, indexes, done);
                        } else {
                            return done();
                        }
                    }
                });
            });
        }
    } else {
        if (checkOnly) {
            return done(null, reBuild, {
                statements: tSql,
                query: ''
            });
        } else {
            if (reBuild) {
                return rebuid(model, m.properties, actualFields, indexes, done);
            } else {
                return done && done();
            }
        }
    }

    function actualize(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (newSettings && changed(newSettings, oldSettings)) {
            reBuild = true;
        }
    }

    function changed(newSettings, oldSettings) {
        var dflt_value = (newSettings.default || null);
        var notnull = (newSettings.null === false ? 1 : 0);
        if (oldSettings.notnull !== notnull
            || oldSettings.dflt_value !== dflt_value) {
            return true;
        }
        if (oldSettings.type.toUpperCase() !== datatype(newSettings)) {
            return true;
        }
        return false;
    }

    function rebuid(model, oldSettings, newSettings, indexes, done) {
        var nsst = [];
        if (newSettings) {
            newSettings.forEach(function (newSetting) {
                if (oldSettings[newSetting.name] !== false) {
                    nsst.push(newSetting.name);
                }
            });
        }
        var rbSql = 'ALTER TABLE `' + model + '` RENAME TO `tmp_' + model + '`;';
        var inSql = 'INSERT INTO `' + model + '` (' + nsst.join(',') + ') '
            + 'SELECT ' + nsst.join(',') + ' FROM `tmp_' + model + '`;';
        var dpSql = 'DROP TABLE `tmp_' + model + '`;';

        return self.command(rbSql, function (err) {
            if (err) console.log(err, rbSql);
            return self.createTable(model, indexes, function (err) {
                if (err) console.log('createTable', err);
                return self.command(inSql, function (err) {
                    if (err) console.log(err, inSql);
                    return self.command(dpSql, function () {
                        if (err) console.log(err, dpSql);
                        self.createIndexes(model, self._models[model], done)
                    });
                });
            });
        });
    }
};

/**
 * Create multi column index callback(err, index)
 * @param {Object} model
 * @param {Object} fields
 * @param {Object} params
 * @param {Function} callback
 */
SQLite3.prototype.ensureIndex = function (model, fields, params, done) {
    var self = this, sql = "", keyName = params.name || null, afld = [], kind = "";
    Object.keys(fields).forEach(function (field) {
        if (!keyName) {
            keyName = model + '_' + field;
        }
        afld.push('`' + field + '` ASC');
    });
    if (params.unique) {
        kind = "UNIQUE";
    }
    sql += 'CREATE ' + kind + ' INDEX `' + keyName + '` ON ' + self.tableEscaped(model) + ' (' + afld.join(', ') + ')';
    self.command(sql, done);
};

/**
 * Create index callback(err, index)
 * @param {Object} model
 * @param {Object} fields
 * @param {Object} params
 * @param {Function} callback
 */
SQLite3.prototype.createIndexes = function (model, props, done) {
    var self = this, sql = [], m = props, s = m.settings;
    for (var fprop in m.properties) {
        var idx = m.properties[fprop];
        if ('undefined' !== typeof idx['index']
            || 'undefined' !== typeof idx['unique']) {
            if (idx['index'] !== false) {
                var UNIQ = 'undefined' !== typeof m.properties[fprop]['unique'] ? ' UNIQUE ' : '';
                sql.push('CREATE ' + UNIQ + ' INDEX `' + model + '_' + fprop + '` ON ' + self.tableEscaped(model) + ' (`' + fprop + '` ASC)');
            }
        }
    }

    if (s.indexes) {
        for (var tprop in s.indexes) {
            var fields = [], columns = s.indexes[tprop]['columns'] || [];
            if (Object.prototype.toString.call(columns) === '[object Array]') {
                fields = columns;
            } else if (typeof columns === 'string') {
                columns = (columns || '').replace(',', ' ').split(/\s+/);
            }
            if (columns.length) {
                columns = columns.map(function (column) {
                    return '`' + column + '` ASC';
                });
                var UNIQ = 'undefined' !== typeof s.indexes[tprop]['unique'] ? ' UNIQUE ' : '';
                sql.push(' CREATE ' + UNIQ + ' INDEX `' + model + '_' + tprop + '` ON ' + self.tableEscaped(model) + ' (' + columns.join(', ') + ')');
            }
        }
    }

    if (sql.length) {
        var tsqls = sql.length;
        sql.forEach(function (query) {
            self.command(query, function () {
                if (--tsqls === 0) done();
            });
        });
    } else {
        done();
    }
};

SQLite3.prototype.propertiesSQL = function (model) {
    var self = this, id = false, sql = [], props = Object.keys(self._models[model].properties);
    var primaryKeys = this._models[model].settings.primaryKeys || [];
    primaryKeys = primaryKeys.slice(0);
    props.forEach(function (prop) {
        if (prop === 'id') {
            return;
        }
        if (self._models[model].properties[prop] !== false) {
            return sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
        }
    });

    if (primaryKeys.length) {
        for (var i = 0, length = primaryKeys.length; i < length; i++) {
            if (props.indexOf(primaryKeys[i]) === -1) {
                if (primaryKeys[i] === 'id') {
                    id = true;
                    sql.push('`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL');
                } else {
                    sql.push('`' + primaryKeys[i].toString().replace(/,\s|,/,'`,`') + '` ' + self.propertySettingsSQL(model, primaryKeys[i]));
                }
            }
        }
        if (!id) {
            sql.push('PRIMARY KEY (`' + primaryKeys.join('`,`') + '`)');
        }
    } else {
        if (!id) {
            sql.push('`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL');
        }
    }
    return sql.join(',\n  ');
};

SQLite3.prototype.propertySettingsSQL = function (model, prop) {
    'use strict';
    var p = this._models[ model ].properties[ prop ], field = [];

    field.push( datatype( p ) );
    field.push( p.allowNull === false || (typeof p[ 'default' ] !== 'undefined' && acceptedDefaults( p )) ? 'NOT NULL' : 'NULL' );
    if ( typeof p[ 'default' ] !== 'undefined' && acceptedDefaults( p ) && typeof p[ 'default' ] !== 'function' ) {
        field.push( 'DEFAULT ' + getDefaultValue( p ) );
    }
    if ( p.unique === true ) {
        field.push( 'UNIQUE' );
    }

    return field.join( " " );
};

function acceptedDefaults(prop) {
    'use strict';
    if ( /^INT|^BIGINT|^VAR|^TINY/i.test( datatype( prop ) ) ) {
        return true;
    } else {
        return false;
    }
}

function getDefaultValue(prop) {
    'use strict';
    if ( /^INT|^BIGINT/i.test( prop.Type || datatype( prop ) ) ) {
        return parseInt( prop[ 'default' ] || prop[ 'Default' ] || 0 );
    } else if ( /^TINY/i.test( prop.Type || datatype( prop ) ) ) {
        return prop[ 'default' ] || prop[ 'Default' ] ? 1 : 0;
    } else {
        return "'" + (prop[ 'default' ] || prop[ 'Default' ] || '') + "'";
    }
}

function datatype(p) {
    switch ((p.type.name || 'string').toLowerCase()) {
        case 'string':
        case 'varchar':
            return 'VARCHAR(' + (p.limit || 255) + ')';
        case 'int':
        case 'integer':
        case 'number':
            return 'INTEGER(' + (p.limit || 11) + ')';
        case 'real':
        case 'float':
        case 'double':
            return 'REAL';
        case 'date':
        case 'timestamp':
            return 'DATETIME';
        case 'boolean':
        case 'bool':
            return 'BOOL';
        default:
            return 'TEXT';
    }
}

SQLite3.prototype.buildWhere = function buildWhere(conds, adapter, model) {
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
    if (conds[key] === null || conds[key] === undefined) {
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
                    val = self.toDatabase(props[key], conds[key]);
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
                    val = (val || '').replace(new RegExp('%25', 'gi'), '%');
                    sqlCond += ' LIKE ';
                    break;
                case 'nlike':
                    val = (val || '').replace(new RegExp('%25', 'gi'), '%');
                    sqlCond += ' NOT LIKE ';
                    break;
                default:
                    sqlCond += ' ' + condType + ' ';
                    break;
            }
            sqlCond += inq === 1 ? '(' + val + ')' : val;
            cs.push(sqlCond);
        });
    } else {
        cs.push(keyEscaped + ' = ' + val);
    }
    return cs;
}

SQLite3.prototype.buildOrderBy = function buildOrderBy(order) {
    if (typeof order === 'string') {
        order = [order];
    }
    return 'ORDER BY ' + order.join(', ');
};

SQLite3.prototype.buildLimit = function buildLimit(limit, offset) {
    return 'LIMIT ' + (offset ? (offset + ', ' + limit) : limit);
};

SQLite3.prototype.buildGroupBy = function buildGroupBy(group) {
    if (typeof group === 'string') {
        group = [group];
    }
    return 'GROUP BY ' + group.join(', ');
};
