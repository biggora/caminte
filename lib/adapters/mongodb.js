/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var mongodb = safeRequire('mongodb');
var mongoClient = mongodb.MongoClient;
var ObjectID = mongodb.ObjectID;
var url = require('url');

exports.initialize = function initializeSchema(schema, callback) {
    'use strict';
    if (!mongodb) {
        return;
    }
    var s = schema.settings;

    if (schema.settings.rs) {
        s.rs = schema.settings.rs;
        if (schema.settings.url) {
            var uris = schema.settings.url.split(',');
            s.hosts = [];
            s.ports = [];
            uris.forEach(function (uri) {
                var durl = url.parse(uri);

                s.hosts.push(durl.hostname || 'localhost');
                s.ports.push(parseInt(durl.port || '27017', 10));

                if (!s.database)
                    s.database = durl.pathname.replace(/^\//, '');
                if (!s.username)
                    s.username = durl.auth && durl.auth.split(':')[0];
                if (!s.password)
                    s.password = durl.auth && durl.auth.split(':')[1];
            });
        }
        s.database = s.database || 'test';
    } else {
        if (schema.settings.url) {
            var durl = url.parse(schema.settings.url);
            s.host = durl.hostname;
            s.port = durl.port;
            s.database = durl.pathname.replace(/^\//, '');
            s.username = durl.auth && durl.auth.split(':')[0];
            s.password = durl.auth && durl.auth.split(':')[1];
        }
        s.host = s.host || 'localhost';
        s.port = parseInt(s.port || '27017', 10);
        s.database = s.database || process.env.USER || 'test';
        if (!s.url) {
            s.url = 'mongodb://' + s.host + ':' + s.port + '/' + s.database;
        }
    }

    s.safe = s.safe || false;
    schema.adapter = new MongoDB(s, schema, callback);
    schema.ObjectID = ObjectID;
};

function MongoDB(s, schema, callback) {
    var self = this;
    self.name = 'mongodb';
    self._models = {};
    self._db = null;
    self.collections = {};
    self.schema = schema;
    self.s = s;

    mongoClient.connect(s.url, function (err, client) {
        if (err) { console.log(err); }
        self.db = client.db(s.database);
        self.client = client;
        self.schema = schema;
        self.connection()
            .then(callback)
            .catch(callback);
    }.bind(this));
}

MongoDB.prototype.connection = function () {
    var t = this;
    return new Promise(function (resolve, reject) {
        if (t.s.username && t.s.password) {
            t.client.authenticate(t.s.username, t.s.password, function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    t.schema.client = t.client;
                    resolve();
                }
            });
        } else {
            t.schema.client = t.client;
            resolve();
        }
    });
};

MongoDB.prototype.define = function (descr) {
    var self = this;
    if (!descr.settings) {
        descr.settings = {};
    }
    self._models[descr.model.modelName] = descr;
    self.connection().then(function (db) {
        Object.keys(descr.properties).forEach(function (k) {
            if (typeof descr.properties[k].index !== 'undefined' || typeof descr.properties[k].unique !== 'undefined') {
                var fields = {}, params = {};
                fields[k] = 1;
                params['name'] = '_' + k + '_';
                if (typeof descr.properties[k].unique !== 'undefined') {
                    params['unique'] = true;
                }
                if (db) {
                    self.db = db;
                }
                self.ensureIndex(descr.model.modelName, fields, params);
            }
        });
    })
        .catch(function (err) {
            console.log('define err:', self.db, err);
        });
};

MongoDB.prototype.defineProperty = function (model, prop, params) {
    this._models[model].properties[prop] = params;
};

MongoDB.prototype.collection = function (name) {
    var collection = this._models[name].settings.collection || name;
    if (!this.collections[collection] && this.db) {
        this.collections[collection] = this.db.collection(collection);
    }
    return this.collections[collection];
};

MongoDB.prototype.ensureIndex = function (model, fields, params, callback) {
    var collection = this.collection(model);
    if (collection && collection.ensureIndex) {
        collection.ensureIndex(fields, params);
    }
    return callback && callback(null);
};

MongoDB.prototype.create = function (model, data, callback) {
    if (data.id === null) {
        delete data.id;
    }
    this.collection(model).insert(data, {}, function (err, m) {
        var inserted;
        inserted = m[0] && m[0]._id ? m[0]._id : null;
        inserted = m.ops && m.ops[0] && m.ops[0]._id ? m.ops[0]._id : inserted;
        callback(err, err ? null : inserted);
    });
};

MongoDB.prototype.save = function (model, data, callback) {
    var id = data.id;
    id = getObjectId(id);
    this.collection(model).update({ _id: id }, data, function (err) {
        callback(err);
    });
};
/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
MongoDB.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    if (filter.id) {
        var id = getObjectId(filter.id);
        filter.id = id;
    }
    this.collection(model).update(filter, { '$set': data }, { w: 1, multi: true }, function (err) {
        return callback && callback(err, 0);
    });
};

MongoDB.prototype.exists = function (model, id, callback) {
    id = getObjectId(id);
    this.collection(model).findOne({ _id: id }, function (err, data) {
        return callback && callback(err, !err && data);
    });
};

MongoDB.prototype.findById = function findById(model, id, callback) {
    var self = this;
    id = getObjectId(id);
    self.collection(model).findOne({ _id: id }, function (err, data) {
        if (data) {
            data.id = id;
            data = self.fromDatabase(model, data);
        }
        callback(err, data);
    });
};

MongoDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
    var self = this;
    if (!data.id) {
        return self.create(data, callback);
    }
    self.find(model, data.id, function (err, inst) {
        if (err)
            return callback(err);
        if (inst) {
            self.updateAttributes(model, data.id, data, callback);
        } else {
            delete data.id;
            self.create(model, data, function (err, id) {
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

MongoDB.prototype.destroy = function destroy(model, id, callback) {
    id = getObjectId(id);
    this.collection(model).remove({ _id: id }, callback);
};

MongoDB.prototype.remove = function remove(model, filter, callback) {
    var cond = buildWhere(filter.where);
    this.collection(model).remove(cond, callback);
};

MongoDB.prototype.all = MongoDB.prototype.find = function all(model, filter, callback) {
    if (!filter) {
        filter = {};
    }
    var query = {};
    if (filter.where) {
        query = buildWhere(filter.where);
    }
    var self = this, cursor = self.collection(model).find(query);

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
    if (filter.skip || filter.offset) {
        cursor.skip(filter.skip || filter.offset);
    }
    cursor.toArray(function (err, data) {
        if (err) {
            return callback(err);
        }
        callback(null, data.map(function (o) {
            return self.fromDatabase(model, o);
        }));
    });
};

MongoDB.prototype.destroyAll = function destroyAll(model, callback) {
    this.collection(model).remove({}, callback);
};

MongoDB.prototype.count = function count(model, callback, filter) {
    var cond = {};
    if (filter && filter.where) {
        cond = buildWhere(filter.where);
    } else {
        cond = buildWhere(filter);
    }
    this.collection(model).count(cond, callback);
};

MongoDB.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    id = getObjectId(id);
    this.collection(model).findAndModify({ _id: id }, [['_id', 'asc']], { $set: data }, {}, callback);
};

MongoDB.prototype.fromDatabase = function (model, data) {
    var props = this._models[model].properties;
    var clean = {};
    Object.keys(data).forEach(function (key) {
        if (!props[key]) {
            return;
        }
        if (props[key].type.name.toString().toLowerCase() === 'date') {
            if (data[key]) {
                clean[key] = new Date(data[key]);
            } else {
                clean[key] = data[key];
            }
        } else {
            clean[key] = data[key];
        }
    });
    clean.id = data._id;
    return clean;
};

MongoDB.prototype.disconnect = function () {
    this.client.close();
};

function getObjectId(id) {
    if (typeof id === 'string') {
        id = new ObjectID(id);
    } else if (typeof id === 'object' && id.constructor === Array) {
        id = new ObjectID(id[0]);
    }
    return id;
}

function buildWhere(filter) {
    var query = {};
    Object.keys(filter).forEach(function (k) {
        var cond = filter[k];
        var spec = false;
        if (k === 'id') {
            k = '_id';
        }

        if (k === 'or') {
            var arrcond = [];
            Object.keys(cond).forEach(function (k2) {
                var nval = {};
                nval[k2] = cond[k2]
                arrcond.push(nval);
            });
            query['$or'] = arrcond;
            return;
        }

        if (cond && cond.constructor.name === 'Object') {
            spec = Object.keys(cond)[0];
            cond = cond[spec];
        }
        if (spec) {
            if (spec === 'between') {
                query[k] = { $gte: cond[0], $lte: cond[1] };
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
                query[k] = { $type: 10 };
            } else {
                query[k] = cond;
            }
        }
    });
    return query;
}
