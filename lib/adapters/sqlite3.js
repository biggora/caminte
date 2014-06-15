/**
 * Module dependencies
 */
var safeRequire = require('../utils').safeRequire;
var sqlite3 = safeRequire('sqlite3');
var BaseSQL = require('../sql');

exports.initialize = function initializeSchema(schema, callback) {
    if (!sqlite3) {
        return;
    }
    var s = schema.settings;
    var Database = sqlite3.verbose().Database;
    var db = new Database(s.database);

    schema.client = db;
    schema.adapter = new SQLite3(schema.client);
    if (s.database === ':memory:') {
        schema.adapter.automigrate(callback);
    } else {
        process.nextTick(callback);
    }
};

function SQLite3(client) {
    this._models = {};
    this.client = client;
}

require('util').inherits(SQLite3, BaseSQL);

SQLite3.prototype.command = function() {
    this.query('run', [].slice.call(arguments));
};

SQLite3.prototype.queryAll = function() {
    this.query('all', [].slice.call(arguments));
};

SQLite3.prototype.queryOne = function() {
    this.query('get', [].slice.call(arguments));
};

SQLite3.prototype.query = function(method, args) {
    var time = Date.now();
    var log = this.log;
    var cb = args.pop();
    if (typeof cb === 'function') {
        args.push(function(err, data) {
            if (log)
                log(args[0], time);
            cb.call(this, err, data);
        });
    } else {
        args.push(cb);
        args.push(function(err, data) {
            log(args[0], time);
        });
    }
    this.client[method].apply(this.client, args);
};

SQLite3.prototype.save = function(model, data, callback) {
    var queryParams = [];
    var sql = 'UPDATE ' + this.tableEscaped(model) + ' SET ' +
        Object.keys(data).map(function(key) {
            queryParams.push(data[key]);
            return key + ' = ?';
        }).join(', ') + ' WHERE id = ' + data.id;
    this.command(sql, queryParams, function(err) {
        callback(err);
    });
};

/**
 * Must invoke callback(err, id)
 * @param {Object} model
 * @param {Object} data
 * @param {Function} callback
 */
SQLite3.prototype.create = function(model, data, callback) {
    data = data || {};
    var questions = [];
    var values = Object.keys(data).map(function(key) {
        questions.push('?');
        return data[key];
    });
    var sql = 'INSERT INTO ' + this.tableEscaped(model) + ' (' + Object.keys(data).join(',') + ') VALUES (';
    sql += questions.join(',');
    sql += ')';
    this.command(sql, values, function(err) {
        callback(err, this && this.lastID);
    });
};

SQLite3.prototype.updateOrCreate = function(model, data, callback) {
    data = data || {};
    var questions = [];
    var values = Object.keys(data).map(function(key) {
        questions.push('?');
        return data[key];
    });
    var sql = 'INSERT OR REPLACE INTO ' + this.tableEscaped(model) + ' (' + Object.keys(data).join(',') + ') VALUES (';
    sql += questions.join(',');
    sql += ')';
    this.command(sql, values, function(err) {
        if (!err && this) {
            data.id = this.lastID;
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
SQLite3.prototype.update = function(model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    var self = this;
    var combined = [];
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

    this.command(sql, queryParams, function(err, affected) {
        callback(err, affected);
    });
};

SQLite3.prototype.toFields = function(model, data) {
    var fields = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function(key) {
        if (props[key]) {
            fields.push('`' + key.replace(/\./g, '`.`') + '` = ' + this.toDatabase(props[key], data[key]));
        }
    }.bind(this));
    return fields.join(',');
};

SQLite3.prototype.toDatabase = function(prop, val) {
    if (val === null) {
        return 'NULL';
    }
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            if (prop.type.name === 'Date') {
                return  'strftime(' + this.toDatabase(prop, val[0]) + ')' +
                    ' AND strftime(' +
                    this.toDatabase(prop, val[1]) + ')';
            } else {
                return  this.toDatabase(prop, val[0]) +
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
    if (prop.type.name === 'Number')
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

    return this.escape(val.toString());
};

SQLite3.prototype.fromDatabase = function(model, data) {
    var self = this;
    if (!data) {
        return null;
    }
    var props = self._models[model].properties;
    Object.keys(data).forEach(function(key) {
        var val = data[key];
        if (props[key]) {
            data[key] = val;
        }
    });
    return data;
};

SQLite3.prototype.escape = function(value) {
    return '"' + escape(value) + '"';
};

SQLite3.prototype.escapeName = function(name) {
    return '`' + name + '`';
};

SQLite3.prototype.exists = function(model, id, callback) {
    var sql = 'SELECT 1 FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function(err, data) {
        if (err)
            return callback(err);
        callback(null, data && data['1'] === 1);
    });
};

SQLite3.prototype.findById = function findById(model, id, callback) {
    var sql = 'SELECT * FROM ' + this.tableEscaped(model) + ' WHERE id = ' + id + ' LIMIT 1';
    this.queryOne(sql, function(err, data) {
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
    var self = this;
    var queryParams = [];

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
            sql += ' ' + this.buildLimit(filter.limit, filter.skip || 0);
        }
    }

    this.queryAll(sql, queryParams, function(err, data) {
        if (err) {
            return callback(err, []);
        }
        callback(null, data.map(function(obj) {
            return self.fromDatabase(model, obj);
        }));
    }.bind(this));
    return sql;
};

SQLite3.prototype.disconnect = function disconnect() {
    this.client.close();
};

SQLite3.prototype.autoupdate = function(cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function(model) {
        wait += 1;
        self.queryAll('PRAGMA TABLE_INFO(' + self.tableEscaped(model) + ')', function(err, fields) {
            self.queryAll('PRAGMA INDEX_LIST(' + self.tableEscaped(model) + ')', function(err, indexes) {
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

SQLite3.prototype.isActual = function(cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function(model) {
        wait += 1;
        self.queryAll('PRAGMA TABLE_INFO(' + self.tableEscaped(model) + ')', function(err, fields) {
            self.queryAll('PRAGMA INDEX_LIST(' + self.tableEscaped(model) + ')', function(err, indexes) {
                if (!err && fields.length) {
                    self.alterTable(model, fields, indexes, done, true);
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

SQLite3.prototype.alterTable = function(model, actualFields, indexes, done, checkOnly) {
    var self = this;
    var m = this._models[model];
    var propNames = Object.keys(m.properties);
    var sql = [], isql = [];
    var reBuild = false;

    // change/add new fields
    propNames.forEach(function(propName) {
        if (propName === 'id') {
            return;
        }
        var found;
        actualFields.forEach(function(f) {
            if (f.name === propName) {
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
    actualFields.forEach(function(f) {
        var notFound = !~propNames.indexOf(f.name);
        if (f.name === 'id') {
            return;
        }
        if (notFound || !m.properties[f.name]) {
            reBuild = true;
            // sql.push('DROP COLUMN `' + f.name + '`');
        }
    });

    for (var prop in m.properties) {
        if ('undefined' !== typeof m.properties[prop]['index']
            || 'undefined' !== typeof m.properties[prop]['unique']) {
            var foundKey = false;
            indexes.forEach(function(index) {
                if ((model + '_' + prop).toString() === index.name) {
                    foundKey = index.name;
                }
            });
            if (!foundKey) {
                var UNIQ = 'undefined' !== typeof m.properties[prop]['unique'] ? ' UNIQUE ' : '';
                isql.push('CREATE ' + UNIQ + ' INDEX `' + model + '_' + prop + '` ON ' + this.tableEscaped(model) + ' (`' + prop + '` ASC)');
            }
        }
    }
    var tSql = [];
    if (sql.length) {
        tSql.push('ALTER TABLE ' + this.tableEscaped(model) + ' ' + sql.join(',\n'));
    }
    if (isql.length) {
        tSql.push(isql.join(';\n'));
    }
    if (tSql.length) {
        if (checkOnly) {
            return done(null, true, {});
        } else {
            return this.command(tSql.join(';\n'), function(err) {
                if (reBuild) {
                    return rebuid(model, m.properties, actualFields, indexes, done);
                } else {
                    return done();
                }
            });
        }
    } else {
        return done && done();
    }

    function actualize(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (newSettings && changed(newSettings, oldSettings)) {
            reBuild = true;
            // sql.push('CHANGE COLUMN `' + propName + '` `' + propName + '` ' + self.propertySettingsSQL(model, propName));
        }
    }

    function changed(newSettings, oldSettings) {
        var dflt_value = (newSettings.default || null);
        var notnull = (newSettings.null || 0);
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
            newSettings.forEach(function(newSetting) {
                if (oldSettings[newSetting.name] !== false) {
                    nsst.push(newSetting.name);
                }
            });
        }
        var rbSql = 'ALTER TABLE `' + model + '` RENAME TO `tmp_' + model + '`;';
        var inSql = 'INSERT INTO `' + model + '` (' + nsst.join(',') + ') '
            + 'SELECT ' + nsst.join(',') + ' FROM `tmp_' + model + '`;';
        var dpSql = 'DROP TABLE `tmp_' + model + '`;';
        return self.command(rbSql, function(err) {
            return self.createTable(model, indexes, function(err) {
                return self.command(inSql, function(err) {
                    return self.command(dpSql, done);
                });
            });
        });
    }
};

SQLite3.prototype.propertiesSQL = function(model) {
    var self = this;
    var sql = ['`id` INTEGER PRIMARY KEY'];
    Object.keys(self._models[model].properties).forEach(function(prop) {
        if (prop === 'id') {
            return;
        }
        if (self._models[model].properties[prop] !== false) {
            return sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
        }
    });
    return sql.join(',\n  ');
};

SQLite3.prototype.propertySettingsSQL = function(model, prop) {
    var p = this._models[model].properties[prop];
    return datatype(p) + ' ' +
        (p.allowNull === false || p['null'] === false ? 'NOT NULL' : 'NULL');
};

function datatype(p) {
    switch ((p.type.name || 'string').toLowerCase()) {
        case 'string':
        case 'varchar':
            return 'VARCHAR(' + (p.limit || 255) + ')';
        case 'json':
        case 'text':
            return 'TEXT';
        case 'number':
        case 'int':
            return 'INT(' + (p.limit || 11) + ')';
        case 'date':
            return 'DATETIME';
        case 'boolean':
        case 'bool':
            return 'TINYINT(1)';
        default:
            return 'VARCHAR(' + (p.limit || 255) + ')';
    }
}


SQLite3.prototype.buildWhere = function buildWhere(conds, adapter, model) {
    var cs = [], or = [],
        self = adapter,
        props = self._models[model].properties;

    Object.keys(conds).forEach(function(key) {
        if (key !== 'or') {
            cs = parseCond(cs, key, props, conds, self);
        } else {
            conds[key].forEach(function(oconds) {
                Object.keys(oconds).forEach(function(okey) {
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
        Object.keys(conds[key]).forEach(function(condType) {
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

SQLite3.prototype.buildOrderBy = function buildOrderBy(order) {
    if (typeof order === 'string')
        order = [order];
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