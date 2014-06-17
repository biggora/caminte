/**
 * Module dependencies
 */
var pg = require('pg');
var caminte = require('caminte');
var util = require('util');

exports.initialize = function initializeSchema(schema, callback) {
    if (!pg) {
        throw new Error('module pg is not defined, try\n  npm install pg');
    }

    var Client = pg.Client;
    var s = schema.settings;
    schema.client = new Client(s.url ? s.url : {
        host: s.host || 'localhost',
        port: s.port || 5432,
        user: s.username,
        password: s.password,
        database: s.database,
        debug: s.debug
    });
    schema.adapter = new PG(schema.client);
    schema.adapter.connect(callback);
};

function PG(client) {
    this.name = 'postgres';
    this._models = {};
    this.client = client;
}

require('util').inherits(PG, caminte.BaseSQL);

PG.prototype.connect = function(callback) {
    this.client.connect(function(err) {
        if (!err) {
            callback();
        } else {
            console.error(err);
            throw err;
        }
    });
};

PG.prototype.tableEscaped = function(model) {
    return this.escapeName(this.table(model));
};

PG.prototype.query = function(sql, callback) {
    var time = Date.now();
    var log = this.log;
    this.client.query(sql, function(err, data) {
        if (log)
            log(sql, time);
        callback(err, data ? data.rows : null);
    });
};

/**
 * Must invoke callback(err, id)
 * @param {String} model
 * @param {Object} data
 * @param {Function} callback
 */
PG.prototype.create = function(model, data, callback) {
    var fields = this.toFields(model, data, true);
    var sql = 'INSERT INTO ' + this.tableEscaped(model) + '';
    if (fields) {
        sql += ' ' + fields;
    } else {
        sql += ' VALUES ()';
    }
    sql += ' RETURNING id';
    this.query(sql, function(err, info) {
        if (err)
            return callback(err);
        callback(err, info && info[0] && info[0].id);
    });
};

/**
 * Must invoke callback(err, data)
 * @param {String} model
 * @param {Object} data
 * @param {Function} callback
 */
PG.prototype.updateOrCreate = function(model, data, callback) {
    var pg = this;
    var fieldsNames = [];
    var fieldValues = [];
    var combined = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function(key) {
        if (props[key] || key === 'id') {
            var k = '"' + key + '"';
            var v;
            if (key !== 'id') {
                v = pg.toDatabase(props[key], data[key]);
            } else {
                v = data[key];
            }
            fieldsNames.push(k);
            fieldValues.push(v);
            if (key !== 'id')
                combined.push(k + ' = ' + v);
        }
    });

    var sql = 'UPDATE ' + this.tableEscaped(model);
    sql += ' SET ' + combined + ' WHERE id = ' + data.id + ';';
    sql += ' INSERT INTO ' + this.tableEscaped(model);
    sql += ' (' + fieldsNames.join(', ') + ')';
    sql += ' SELECT ' + fieldValues.join(', ');
    sql += ' WHERE NOT EXISTS (SELECT 1 FROM ' + this.tableEscaped(model);
    sql += ' WHERE id = ' + data.id + ') RETURNING id';

    this.query(sql, function(err, info) {
        if (!err && info && info[0] && info[0].id) {
            data.id = info[0].id;
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
PG.prototype.update = function(model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    var self = this;
    var combined = [];
    var props = this._models[model].properties;
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

    this.query(sql, function(err, affected) {
        callback(err, affected);
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
    var sql = 'SELECT ' + this.getColumns(model) + ' FROM '
        + this.tableEscaped(model) + ' '
        + this.toFilter(model, filter);

    this.query(sql, function(err, data) {
        if (err) {
            return callback(err, []);
        }
        if (filter && filter.include) {
            this._models[model].model.include(data, filter.include, callback);
        } else {
            callback(null, data);
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
    this.query(sql, function(err, data) {
        if (err) {
            return callback(err, []);
        }
        if (filter && filter.include) {
            this._models[model].model.include(data, filter.include, callback);
        } else {
            callback(null, data);
        }
    }.bind(this));
};

PG.prototype.toFields = function(model, data, forCreate) {
    var fields = [];
    var props = this._models[model].properties;

    if (forCreate) {
        var columns = [];
        Object.keys(data).forEach(function(key) {
            if (props[key]) {
                if (key === 'id')
                    return;
                columns.push('"' + key + '"');
                fields.push(this.toDatabase(props[key], data[key]));
            }
        }.bind(this));
        return '(' + columns.join(',') + ') VALUES (' + fields.join(',') + ')';
    } else {
        Object.keys(data).forEach(function(key) {
            if (props[key]) {
                if (key === 'id')
                    return;
                fields.push('"' + key + '" = ' + this.toDatabase(props[key], data[key]));
            }
        }.bind(this));
        return fields.join(',');
    }
};

function dateToPostgres(val) {
    return [
        val.getFullYear(),
        fz(val.getMonth() + 1),
        fz(val.getDate())
    ].join('-') + ' ' + [
        fz(val.getHours()),
        fz(val.getMinutes()),
        fz(val.getSeconds())
    ].join(':');

    function fz(v) {
        return v < 10 ? '0' + v : v;
    }
}

PG.prototype.toDatabase = function(prop, val) {
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
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0];
        val = val[operator];
        if (operator === 'between') {
            return this.toDatabase(prop, val[0]) + ' AND ' + this.toDatabase(prop, val[1]);
        }
        if (operator === 'inq' || operator === 'nin') {
            for (var i = 0; i < val.length; i++) {
                val[i] = escape(val[i]);
            }
            return val.join(',');
        }
    }
    if (prop.type.name === 'Number') {
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
    ;

    if (prop.type.name === 'Date') {
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
    return escape(val.toString());

};

PG.prototype.fromDatabase = function(model, data) {
    if (!data)
        return null;
    var props = this._models[model].properties;
    Object.keys(data).forEach(function(key) {
        var val = data[key];
        data[key] = val;
    });
    return data;
};

PG.prototype.escapeName = escapeName;

PG.prototype.getColumns = function(model) {
    return '"' + Object.keys(this._models[model].properties).join('", "') + '"';
};

PG.prototype.toFilter = function(model, filter) {
    var self = this;
    if (filter && typeof filter.where === 'function') {
        return filter();
    }
    if (!filter)
        return '';
    var self = this;
    var out = '';

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
        out += self.buildLimit(filter.limit,(filter.offset || '0'));
    }

    return out;
};

function getTableStatus(model, cb) {
    function decoratedCallback(err, data) {
        data.forEach(function(field) {
            field.Type = mapPostgresDatatypes(field.Type);
        });
        cb(err, data);
    }
    ;
    this.query('SELECT column_name as "Field", udt_name as "Type", is_nullable as "Null", column_default as "Default" FROM information_schema.COLUMNS WHERE table_name = \'' + this.table(model) + '\'', decoratedCallback);
}
;

PG.prototype.autoupdate = function(cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function(model) {
        wait += 1;
        var indexes = [];
        getTableStatus.call(self, model, function(err, fields) {
            if (!err && fields.length) {
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
        if (--wait === 0 && cb) {
            cb();
        }
    }
    ;
};

PG.prototype.isActual = function(cb) {
    var self = this;
    var wait = 0;
    changes = [];
    Object.keys(this._models).forEach(function(model) {
        wait += 1;
        getTableStatus.call(self, model, function(err, fields) {
            changes = changes.concat(getPendingChanges.call(self, model, fields));
            done(err, changes);
        });
    });

    function done(err, fields) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0 && cb) {
            var actual = (changes.length === 0);
            cb(null, actual);
        }
    }
    ;
};

PG.prototype.alterTable = function(model, actualFields, indexes, done) {
    var self = this;
    var pendingChanges = getPendingChanges.call(self, model, actualFields);
    applySqlChanges.call(self, model, pendingChanges, done);
};

function getPendingChanges(model, actualFields) {
    var sql = [];
    var self = this;
    sql = sql.concat(getColumnsToAdd.call(self, model, actualFields));
    sql = sql.concat(getPropertiesToModify.call(self, model, actualFields));
    sql = sql.concat(getColumnsToDrop.call(self, model, actualFields));
    return sql;
}
;

function getColumnsToAdd(model, actualFields) {
    var self = this;
    var m = self._models[model];
    var propNames = Object.keys(m.properties);
    var sql = [];
    propNames.forEach(function(propName) {
        if (propName === 'id')
            return;
        var found = searchForPropertyInActual.call(self, propName, actualFields);
        if (!found && propertyHasNotBeenDeleted.call(self, model, propName)) {
            sql.push(addPropertyToActual.call(self, model, propName));
        }
    });
    return sql;
}
;

function addPropertyToActual(model, propName) {
    var self = this;
    var p = self._models[model].properties[propName];
    var sqlCommand = 'ADD COLUMN "' + propName + '" ' + datatype(p) + " " + (propertyCanBeNull.call(self, model, propName) ? "" : " NOT NULL");
    return sqlCommand;
}
;

function searchForPropertyInActual(propName, actualFields) {
    var found = false;
    actualFields.forEach(function(f) {
        if (f.Field === propName) {
            found = f;
            return;
        }
    });
    return found;
}
;

function getPropertiesToModify(model, actualFields) {
    var self = this;
    var sql = [];
    var m = self._models[model];
    var propNames = Object.keys(m.properties);
    var found;
    propNames.forEach(function(propName) {
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

    return sql;

    function datatypeChanged(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (!newSettings)
            return false;
        return oldSettings.Type.toLowerCase() !== datatype(newSettings);
    }
    ;

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
    ;
}
;

function modifyDatatypeInActual(model, propName) {
    var self = this;
    var sqlCommand = 'ALTER COLUMN "' + propName + '"  TYPE ' + datatype(self._models[model].properties[propName]);
    return sqlCommand;
}
;

function modifyNullabilityInActual(model, propName) {
    var self = this;
    var sqlCommand = 'ALTER COLUMN "' + propName + '" ';
    if (propertyCanBeNull.call(self, model, propName)) {
        sqlCommand = sqlCommand + "DROP ";
    } else {
        sqlCommand = sqlCommand + "SET ";
    }
    sqlCommand = sqlCommand + "NOT NULL";
    return sqlCommand;
}
;

function getColumnsToDrop(model, actualFields) {
    var self = this;
    var sql = [];
    actualFields.forEach(function(actualField) {
        if (actualField.Field === 'id')
            return;
        if (actualFieldNotPresentInModel(actualField, model)) {
            sql.push('DROP COLUMN "' + actualField.Field + '"');
        }
    });
    return sql;

    function actualFieldNotPresentInModel(actualField, model) {
        return !(self._models[model].properties[actualField.Field]);
    }
    ;
}
;

function applySqlChanges(model, pendingChanges, done) {
    var self = this;
    if (pendingChanges.length) {
        var thisQuery = 'ALTER TABLE ' + self.tableEscaped(model);
        var ranOnce = false;
        pendingChanges.forEach(function(change) {
            if (ranOnce)
                thisQuery = thisQuery + ',';
            thisQuery = thisQuery + ' ' + change;
            ranOnce = true;
        });
        thisQuery = thisQuery + ';';
        self.query(thisQuery, callback);
    }

    function callback(err, data) {
        if (err)
            console.log(err);
    }

    done();
}
;

PG.prototype.propertiesSQL = function(model) {
    var self = this;
    var sql = ['"id" SERIAL PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function(prop) {
        if (prop === 'id')
            return;
        sql.push('"' + prop + '" ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');

};

PG.prototype.propertySettingsSQL = function(model, propName) {
    var self = this;
    var p = self._models[model].properties[propName];
    var result = datatype(p) + ' ';
    if (!propertyCanBeNull.call(self, model, propName))
        result = result + 'NOT NULL ';
    return result;
};

function propertyCanBeNull(model, propName) {
    var p = this._models[model].properties[propName];
    return !(p.allowNull === false || p['null'] === false);
}
;

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

    val = val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function(s) {
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
;

function datatype(p) {
    switch (p.type.name) {
        default:
        case 'String':
        case 'Varchar':
            return 'varchar';
        case 'JSON':
        case 'Text':
            return 'text';
        case 'Number':
            return 'integer';
        case 'Date':
            return 'timestamp';
        case 'Boolean':
            return 'boolean';
    }
}
;

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
;

function propertyHasNotBeenDeleted(model, propName) {
    return !!this._models[model].properties[propName];
}
;

PG.prototype.buildWhere = function buildWhere(conds, adapter, model) {
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
    orop += (orop !== "" && cs.length > 0)? ' AND ':'';
    return 'WHERE ' + orop + cs.join(' AND ');
};

function parseCond(cs, key, props, conds, self) {
    var keyEscaped = escapeName(key);
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

PG.prototype.buildOrderBy = function buildOrderBy(order) {
    if (typeof order === 'string')
        order = [order];
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
