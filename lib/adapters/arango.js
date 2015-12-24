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
    if (!schema.settings.url) {
        var durl = schema.settings.host || 'localhost';
        if (schema.settings.port)
            durl += ':' + schema.settings.port;
        var auth = '';
        if (schema.settings.username) {
            auth = schema.settings.username;
            if (schema.settings.password) {
                auth += ':' + schema.settings.password;
            }
        }
        if (auth) {
            durl = auth + '@' + url;
        }
        durl += '/';
        durl = 'http://' + durl;
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
    self.client.createDatabase(s.database).then(function (res) {
        console.log('Database ' + schema.settings.database + ' created!');
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
            //
        });
    }
    if (keys.uniques.length) {
        self.ensureIndex(descr.model.modelName, keys.uniques, true, function () {
            //
        });
    }
};

Arango.prototype.getModelIndexes = function (name) {
    var model = this._models[name], indexes = [], uniques = [];
    Object.keys(model.properties).forEach(function (k) {
        if (typeof model.properties[k].index !== 'undefined' || typeof model.properties[k].unique !== 'undefined') {
            if (typeof model.properties[k].unique !== 'undefined') {
                uniques.push(k);
            } else {
                indexes.push(k);
            }
        }
    });
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
 * @param {Function} cb
 */
Arango.prototype.autoupdate = function (callback) {
    var self = this, pending = Object.keys(self._models).length;
    if (!pending) {
        return callback && callback();
    }
    Object.keys(self._models).forEach(function (model) {
        self.collection(model).create();
        self.collection(model)
            .setProperties({waitForSync: true})
            .then(function () {
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
    self.collection(model).save(data)
        .then(function (res) {
            var err = (res || {}).error ? res : null;
            if (err) {
                return callback && callback(err);
            } else {
                data.id = parseInt(res._key);
                self.collection(model).update(res, {id: data.id}).then(function (res) {
                    var err = res.error ? res : null;
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
    this.collection(model).document('' + id).then(function (res) {
        var err = (res || {}).error ? res : null;
        return callback && callback(err, !err && res.id);
    }.bind(this));
};

Arango.prototype.all = Arango.prototype.find = function (model, filter, callback) {
    var self = this, query = ['FOR x IN @@collection'];
    var bindVars = {
        '@collection': model
    }, partName, index = 0;

    if (filter) {
        if (filter.where) {
            Object.keys(filter.where).forEach(function (k) {
                var cond = filter.where[k];
                var spec = false;
                partName = 'where' + (index++);
                if (cond && cond.constructor.name === 'Object') {
                    spec = Object.keys(cond)[0];
                    cond = cond[spec];
                }
                if (spec) {
                    if (spec === 'between') {
                        // mop: XXX need to check docs
                        throw new Error("between statements not supported for arangodb");
                    } else {
                        // bindVars[partName] = cond;
                        // query.push('x.' + k + ' IN @' + partName);
                    }
                } else {
                    bindVars[partName] = cond;
                    query.push('FILTER x.`' + k + '` == @' + partName);
                }
            }.bind(self));
        }
        if (filter.order) {
            // var order = 'i.' + filter.order;
            // if (typeof order === 'string') order = [order];
            // query.sort(order.join(', '));
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
            if (err) { console.log('query err:', err.message); }
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
        self.collection(model).all(opt).then(function (res) {
            var err = (res || {}).error ? res : null;
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
    return this.collection(model).remove('' + id).then(function (res) {
        var err = (res || {}).error ? res : null;
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
    this.collection(model).truncate().then(function (res) {
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