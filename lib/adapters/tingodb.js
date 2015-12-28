/**
 * Module dependencies
 * mongodb adapter with a few tweaks to run tingodb
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var tingodb = safeRequire('tingodb');
var fs = require('fs');

exports.initialize = function initializeSchema(schema, callback) {
    if (!tingodb) {
        return;
    }
    var s = schema.settings;
    s.database = s.database || './db/data';
    s.nativeObjectID = s.nativeObjectID || false;
    s.cacheSize = s.cacheSize || 1000;
    s.cacheMaxObjSize = s.cacheMaxObjSize || 1024;
    s.searchInArray = s.searchInArray || false;

    if (!fs.existsSync(s.database)) {
        console.log('Database directory not exists ' + s.database + ', please create!');
    }

    schema.adapter = new TingoDB(s, schema, callback);
};

function TingoDB(s, schema, callback) {
    this.name = 'tingodb';
    this._models = {};
    this.collections = {};
    this.settings = s;
    var Db = tingodb().Db;
    this.db = new Db(s.database, s);
    this.db.open(function (err, client) {
        if (err) {
            throw err;
        }
        if (client) {
            this.client = client;
            schema.client = client;
            callback();
        } else {
            throw new Error('client not loaded');
        }
    }.bind(this));
}

TingoDB.prototype.define = function (descr) {
    if (!descr.settings) {
        descr.settings = {};
    }
    var self = this;
    self._models[descr.model.modelName] = descr;
    self.collections[descr.model.modelName] = self.db.collection(descr.model.modelName);
    setTimeout(function () {
        Object.keys(descr.properties).forEach(function (k) {
            if (typeof descr.properties[k].index !== 'undefined' || typeof descr.properties[k].unique !== 'undefined') {
                var fields = {}, params = {};
                fields[k] = 1;
                params['name'] = '_' + k + '_';
                if (typeof descr.properties[k].unique !== 'undefined') {
                    params['unique'] = true;
                }
                self.collection(descr.model.modelName).ensureIndex(fields, params);
            }
        });
    }, 1000);
};

TingoDB.prototype.autoupdate = function (callback) {
    var self = this;
    var settings = self.settings;
    if (!fs.existsSync(settings.database)) {
        console.log('Database directory not exists ' + settings.database + ', please create!');
        return callback && callback();
    } else {
        setTimeout(function () {
            return callback && callback();
        }, 1000);
    }
};

TingoDB.prototype.defineProperty = function (model, prop, params) {
    this._models[model].properties[prop] = params;
};

TingoDB.prototype.collection = function (name) {
    var self = this;
    if (!self.collections[name]) {
        self.collections[name] = self.client.collection(self.client, name);
    }
    return self.collections[name];
};

TingoDB.prototype.ensureIndex = function (model, fields, params, callback) {
    this.collection(model).ensureIndex(fields, params);
    return callback(null);
};

TingoDB.prototype.create = function (model, data, callback) {
    if (data.id === null) {
        delete data.id;
    }
    this.collection(model).insert(data, {}, function (err, m) {
        return callback && callback(err, err ? null : m[0]._id);
    });
};

TingoDB.prototype.save = function (model, data, callback) {
    var id = data.id;
    this.collection(model).update({_id: id}, data, function (err) {
        callback(err);
    });
};

TingoDB.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    this.collection(model).update(filter, data, function (err) {
        callback(err);
    });
};

TingoDB.prototype.exists = function (model, id, callback) {
    this.collection(model).findOne({_id: id}, function (err, data) {
        callback(err, !err && data);
    });
};

TingoDB.prototype.findById = function findById(model, id, callback) {
    this.collection(model).findOne({_id: id}, function (err, data) {
        if (data) {
            data.id = id;
        }
        callback(err, data);
    });
};

TingoDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
    var adapter = this;
    if (!data.id) {
        return this.create(data, callback);
    }
    this.findById(model, data.id, function (err, inst) {
        if (err)
            return callback(err);
        if (inst) {
            adapter.updateAttributes(model, data.id, data, callback);
        } else {
            delete data.id;
            adapter.create(model, data, function (err, id) {
                if (err)
                    return callback(err);
                if (id) {
                    data.id = id;
                    delete data._id;
                    callback(null, data);
                } else {
                    callback(null, null); // wtf?
                }
            });
        }
    });
};

TingoDB.prototype.destroy = function destroy(model, id, callback) {
    this.collection(model).remove({_id: id}, callback);
};

TingoDB.prototype.remove = function remove(model, filter, callback) {
    var cond = buildWhere(filter.where);
    this.collection(model).remove(cond, callback);
};

TingoDB.prototype.all = function all(model, filter, callback) {
    if (!filter) {
        filter = {};
    }
    var query = {};
    if (filter.where) {
        query = buildWhere(filter.where);
    }
    var cursor = this.collection(model).find(query);

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
                args[key] = -1;
            } else {
                args[key] = 1;
            }
        }
        cursor.sort(args);
    }
    if (filter.limit) {
        cursor.limit(filter.limit);
    }
    if (filter.skip) {
        cursor.skip(filter.skip);
    } else if (filter.offset) {
        cursor.skip(filter.offset);
    }
    cursor.toArray(function (err, data) {
        if (err)
            return callback(err);
        callback(null, data.map(function (o) {
            o.id = o._id;
            return o;
        }));
    });
};

TingoDB.prototype.destroyAll = function destroyAll(model, callback) {
    this.collection(model).remove({}, callback);
};

TingoDB.prototype.count = function count(model, callback, filter) {
    var cond = buildWhere(filter);
    this.collection(model).count(cond, callback);
};

TingoDB.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    this.collection(model).findAndModify({_id: id}, [['_id', 'asc']], {$set: data}, {}, callback);
};

TingoDB.prototype.disconnect = function () {
    this.client.close();
};

function buildWhere(filter) {
    var query = {};
    Object.keys(filter).forEach(function (k) {
        var cond = filter[k];
        var spec = false;
        if (k === 'id') {
            k = '_id';
        }
        if (cond && cond.constructor.name === 'Object') {
            spec = Object.keys(cond)[0];
            cond = cond[spec];
        }
        if (spec) {
            if (spec === 'between') {
                query[k] = {$gte: cond[0], $lte: cond[1]};
            } else {
                query[k] = {};
                spec = spec === 'inq' ? 'in' : spec;
                spec = spec === 'like' ? 'regex' : spec;
                if (spec === 'nlike') {
                    query[k]['$not'] = new RegExp(cond, 'i');
                } else {
                    query[k]['$' + spec] = cond;
                }
            }
        } else {
            if (cond === null) {
                query[k] = {$type: 10};
            } else {
                query[k] = cond;
            }
        }
    });
    return query;
}
