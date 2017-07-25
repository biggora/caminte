/**
 * Module dependencies
 */
var utils = require('../utils');
var util = require('util');
var safeRequire = utils.safeRequire;
var arango = safeRequire('arangojs');
var url = require('url');

exports.initialize = function initializeSchema(schema, callback) {
    if (!arango) return;
    var s = schema.settings;

    if (schema.settings.url) {
        var uri = url.parse(schema.settings.url);
        s.host = uri.hostname;
        s.port = uri.port || '8529';
        s.database = uri.pathname.replace(/^\//, '');
        s.username = uri.auth && uri.auth.split(':')[0];
        s.password = uri.auth && uri.auth.split(':')[1];
    }
    s.host = s.host || 'localhost';
    s.port = parseInt(s.port || '8529', 10);
    s.database = s.database || 'test';

    if (!('url' in schema.settings)) {
        schema.settings.url = '';
        let durl = 'http://';

        let auth = '';
        if('username' in schema.settings){
            auth = schema.settings.username;
            if('password' in schema.settings)
                auth += ':'+schema.settings.password;
            auth += '@';
        }

        durl += auth+s.host+":"+s.port+"/";
        schema.settings.url = durl;
    }
    schema.adapter = new Arango(s, schema, callback);
};

var ArangoId = function (fullId) {
    var parts = fullId.split('/');
    this._id = parts[0];
    this._rev = parts[1];
};

ArangoId.prototype.id = function () {
    return this._id;
};

ArangoId.prototype.rev = function () {
    return this._rev;
};

ArangoId.prototype.fullId = function () {
    return this._id + '/' + this._rev;
};

ArangoId.prototype.setRev = function (rev) {
    this._rev = rev;
};

function Arango(s, schema, callback) {
    var self = this;
    self.name = 'arango';
    self._models = {};
    self.settings = s;
    self.collections = {};
    self.aqlQuery = arango.aqlQuery;
    self.client = new arango.Database(schema.settings.url);
    self.client.createDatabase(s.database, function (res) {
        // console.log('Database ' + schema.settings.database + ' created!');
    }, function (err) {
        if (err.errorNum !== 1207) {
            console.log("Failed to create database: %j", err);
        }
    });
    self.client.useDatabase(s.database);
    schema.client = self.client;
    process.nextTick(function () {
        callback();
    });
}

Arango.prototype.define = function (descr) {
    var self = this, indexes;
    if (!descr.settings) descr.settings = {};
    self._models[descr.model.modelName] = descr;
    self.client.useDatabase(self.settings.database);
    var collection = self.client.collection(descr.model.modelName);
    collection.create();
    self.collections[descr.model.modelName] = collection;

    var keys = self.getModelIndexes(descr.model.modelName);
    if (keys.indexes.length) {
        self.ensureIndex(descr.model.modelName, keys.indexes, false, function () {
            // created
        }.bind(self));
    }
    if (keys.uniques.length) {
        self.ensureIndex(descr.model.modelName, keys.uniques, true, function () {
            // created
        }.bind(self));
    }
};

Arango.prototype.getModelIndexes = function (name) {
    var model = this._models[name], indexes = [], uniques = [];
    Object.keys(model.properties).forEach(function (k) {
        if (typeof model.properties[k].unique !== 'undefined') {
            uniques.push(k);
        }
        if (typeof model.properties[k].index !== 'undefined') {
            indexes.push(k);
        }
    }.bind(this));
    return {
        indexes: indexes,
        uniques: uniques
    };
};

Arango.prototype.collection = function (name) {
    if (this.client.collection) {
        return this.client.collection(name);
    } else {
        if (!this.collections[name]) {
            this.collections[name] = this.client.collection(name);
        }
        return this.collections[name];
    }
};

/**
 * Update existing database collections.
 * @param {Function} callback
 */
Arango.prototype.autoupdate = function (callback) {
    var self = this, pending = Object.keys(self._models).length;
    if (!pending) {
        return callback && callback();
    }
    Object.keys(self._models).forEach(function (model) {
        self.collection(model).create(function () {
            self.collection(model)
                .setProperties({waitForSync: true}, function () {
                    if (--pending === 0) {
                        setTimeout(function () {
                            var keys = self.getModelIndexes(model);
                            self.ensureIndex(model, keys.indexes, false, function () {
                                return self.ensureIndex(model, keys.uniques, true, callback);
                            });
                        }, 100);
                    }
                });
        });

    });
};

/**
 * Re create existing database collections.
 * @param {Function} callback
 */
Arango.prototype.automigrate = function (callback) {
    var self = this, pending = 0;
    Object.keys(self._models).forEach(function (model) {
        pending++;
        self.client.collection.delete(model, function (err, result) {
            if (!err || result.code == 404) {
                self.collection(model).create({waitForSync: true}, function (err) {
                    if (err) {
                        return callback && callback(err);
                    } else {
                        collectionCreated();
                    }
                });
            }
        }.bind(self));
    }, self);

    var collectionCreated = function () {
        if (--pending == 0 && callback) {
            callback();
        }
    }
};

Arango.prototype.defineForeignKey = function (model, key, cb) {
    cb(null, String);
};

Arango.prototype.fromDatabase = function (model, data) {
    if (!data) {
        return null;
    }
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (/^_/.test(key)) {
            delete data[key];
            return;
        }
        var val = data[key];
        if (props[key]) {
            if (props[key].type.name === 'Date' && val !== null) {
                val = new Date(val);
            }
        }
        data[key] = val;
    });
    return data;
};

Arango.prototype.create = function (model, data, callback) {
    this.save(model, data, callback);
};

Arango.prototype.save = function (model, data, callback) {
    var self = this;
    self.collection(model).save(data, function (err, res) {
        if (err) {
            return callback && callback(err);
        } else {
            data.id = parseInt(res._key);
            self.collection(model).update(res, {id: data.id}, function (err, res) {
                return callback && callback(err, data.id, res._rev);
            });
        }
    }.bind(this));
};

Arango.prototype.findById = function (model, id, callback) {
    var self = this;
    self.collection(model).document('' + id, function (err, res) {
        var data;
        err = (err || {}).code !== 404 ? err : null;
        if (!err) {
            if (res && res.id) {
                res.id = parseInt(res._key);
                data = self.fromDatabase(model, res);
            }
        }
        return callback && callback(err, data);
    }.bind(this));
};

Arango.prototype.exists = function (model, id, callback) {
    this.collection(model).document('' + id, function (err, res) {
        return callback && callback(err, !err && res.id);
    }.bind(this));
};

Arango.prototype.all = Arango.prototype.find = function (model, filter, callback) {
    var self = this, query = ['FOR x IN @@collection'];
    var bindVars = {
        '@collection': model
    };

    if (filter) {
        if (filter.where && Object.keys(filter.where).length === 0) {
            var csql = self.buildWhere(filter.where, self, model);
            query.push(csql.query.join(' '));
            Object.keys(csql.bindVars).forEach(function (bkey) {
                bindVars[bkey] = csql.bindVars[bkey];
            });
        }
        if (filter.order) {
            var keys = filter.order;
            if (typeof keys === 'string') {
                keys = keys.split(',');
            }
            var args = {};
            for (var index in keys) {
                var m = keys[index].match(/\s+(A|DE)SC$/);
                var key = keys[index];
                key = key.replace(/\s+(A|DE)SC$/, '').trim();
                if (m && m[1] === 'DE') {
                    args[key] = 'DESC';
                } else {
                    args[key] = 'ASC';
                }
            }

            var order = '';
            Object.keys(args).forEach(function (kx) {
                order += 'x.`' + kx + '` ' + args[kx];
            });
            query.push('SORT ' + order);
        }
        if (filter.limit) {
            query.push('LIMIT @skip, @limit');
            bindVars['skip'] = filter.skip || 0;
            bindVars['limit'] = filter.limit || 20;
        }
        query.push('RETURN x');

        var maql = self.aqlQuery([query.join(' ')]);
        maql.bindVars = bindVars;
        if (!Object.keys(bindVars).length) {
            maql = query.join(' ');
        }

        self.client.query(maql, function (err, cursor) {
            if (err) {
                console.log('query err:', err.message);
            }
            var data = (cursor || {})._result || [];
            if (data && data.length) {
                data = data.map(function (i) {
                    return self.fromDatabase(model, i);
                });
            }
            return callback && callback(err, data)
        }.bind(self));
    } else {
        var opt = {};
        if (filter.limit) {
            opt.skip = filter.offset || filter.skip || 0;
            opt.limit = filter.limit;
        }
        self.collection(model).all(opt, function (err, res) {
            var data = (res || {})._result || [];
            if (data && data.length) {
                data = data.map(function (i) {
                    return self.fromDatabase(model, i);
                });
            }
            return callback && callback(err, data);
        }.bind(self));
    }
};

Arango.prototype.destroy = function (model, id, callback) {
    return this.collection(model).remove('' + id, function (err, res) {
        return callback && callback(err);
    }.bind(this));
};

Arango.prototype.updateAttributes = function (model, id, newData, callback) {
    this.collection(model).update('' + id, newData, function (err, data) {
        return callback && callback(err, data);
    }.bind(this));
};

// TODO: implement
Arango.prototype.count = function (model, callback, where) {
    if (!where) {
        this.collection(model).count(function (err, res) {
            return callback && callback(err, (res || {}).count || 0);
        }.bind(this));
    } else {
        this.collection(model).count(function (err, res) {
            return callback && callback(err, (res || {}).count || 0);
        }.bind(this));
    }
};
/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
Arango.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }

    filter = filter || {};
    filter = filter.where ? filter.where : filter;

    this.collection(model).updateByExample(filter, data, callback);
};

// TODO: implement
Arango.prototype.remove = function remove(model, filter, callback) {
    // var cond = buildWhere(filter.where);
    this.collection(model).removeByExample(filter.where, callback);
};

/**
 * Truncate collection.
 * @param {Function} callback
 */
Arango.prototype.destroyAll = function (model, callback) {
    this.collection(model).truncate(function (res) {
        var err = (res || {}).error ? res : null;
        return callback && callback(err);
    }.bind(this));
};

/**
 * EnsureIndex in collection.
 * @param {String} model
 * @param {Array} fields
 * @param {Array} unique
 * @param {Function} callback
 * @returns {*}
 */
Arango.prototype.ensureIndex = function ensureIndex(model, fields, unique, callback) {
    if (!fields || !fields.length) {
        return callback && callback();
    }
    if (typeof unique === 'function') {
        callback = unique;
        unique = false;
    }
    this.collection(model)
        .createHashIndex(fields, {unique: unique}, callback);
};

Arango.prototype.buildWhere = function buildWhere(conds, adapter, model) {
    'use strict';
    var qw = {}, cs = [], or = [], bindVars = {}, cix = 0,
        self = adapter,
        props = self._models[model].properties;

    Object.keys(conds).forEach(function (key) {
        if (key !== 'or') {
            qw = parseCond(cs, bindVars, key, props, conds, self, cix);
        } else {
            conds[key].forEach(function (oconds) {
                Object.keys(oconds).forEach(function (okey) {
                    or = parseCond(or, bindVars, okey, props, oconds, self, cix);
                });
            });
        }
        cix++;
    });

    if (cs.length === 0 && or.length === 0) {
        return '';
    }
    var orop = '';
    if (or.length) {
        orop = ' (' + or.join(' OR ') + ') ';
    }
    orop += (orop !== "" && cs.length > 0) ? ' AND ' : '';

    return qw;
};

Arango.prototype.toDatabase = function (prop, val, esc) {
    "use strict";
    if (val === null) {
        return '';
    }
    if (!prop) {
        return val;
    }
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
    if (prop.type.name === 'Number') {
        return val;
    }
    if (prop.type.name === 'Date') {
        if (!val) {
            return 0;
        }
        if (typeof val === 'string') {
            val = Date.parse(val);
        }
        if (val instanceof Date) {
            val = val.getTime();
        }
        return val;
    }
    if (prop.type.name === "Boolean") {
        return val ? 1 : 0;
    }
    return esc ? escape(val) : val;
};

function escape(val) {
    if (typeof val === 'string') {
        return '\'' + val + '\'';
    }
    return val;
}

var parseCond = function (cs, bindVars, key, props, conds, self, cix) {
    'use strict';
    var keyEscaped = 'FILTER x.`' + key + '`';
    var val = conds[key];
    if (val === null) {
        cs.push(keyEscaped + '\'\'');
    } else if (val.constructor.name === 'Object') {
        Object.keys(val).forEach(function (condType) {
            var inq = 'in,inq,nin'.indexOf(condType) > -1 ? 1 : 0;
            val = self.toDatabase(props[key], val[condType], true);
            var sqlCond = keyEscaped;
            if ((condType === 'inq' || condType === 'nin') && val.length === 0) {
                cs.push(condType === 'inq' ? 0 : 1);
                return true;
            }
            switch (condType.toString().toLowerCase()) {
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
                    sqlCond += ' ';
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
                sqlCond += ' >= @whereL';
                sqlCond += ' AND x.`' + key + '`';
                sqlCond += ' <= @whereG';
                bindVars['whereL'] = val[0];
                bindVars['whereG'] = val[1];
            } else if (inq === 1) {
                sqlCond += ' @where' + cix;
                bindVars['where' + cix] = val;
            } else {
                sqlCond += val;
            }
            cs.push(sqlCond);
        });

    } else if (/^\//gi.test(conds[key])) {
        var reg = val.toString().split('/');
        cs.push(keyEscaped + ' REGEXP "' + reg[1] + '"');
    } else {
        val = self.toDatabase(props[key], val, false);
        cs.push(keyEscaped + ' == @where' + cix);
        bindVars['where' + cix] = val;
    }
    return {
        query: cs,
        bindVars: bindVars
    };
};
