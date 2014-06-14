/**
 * Module dependencies
 */
var safeRequire = require('../utils').safeRequire;
var mongodb = safeRequire('mongodb');
var ObjectID = mongodb.ObjectID;

exports.initialize = function initializeSchema(schema, callback) {
    if (!mongodb)
        return;

    var s = schema.settings;

    if (schema.settings.rs) {
        s.rs = schema.settings.rs;
        if (schema.settings.url) {
            var uris = schema.settings.url.split(',');
            s.hosts = [];
            s.ports = [];
            uris.forEach(function(uri) {
                var url = require('url').parse(uri);

                s.hosts.push(url.hostname || 'localhost');
                s.ports.push(parseInt(url.port || '27017', 10));

                if (!s.database)
                    s.database = url.pathname.replace(/^\//, '');
                if (!s.username)
                    s.username = url.auth && url.auth.split(':')[0];
                if (!s.password)
                    s.password = url.auth && url.auth.split(':')[1];
            });
        }
        s.database = s.database || 'test';
    } else {
        if (schema.settings.url) {
            var url = require('url').parse(schema.settings.url);
            s.host = url.hostname;
            s.port = url.port;
            s.database = url.pathname.replace(/^\//, '');
            s.username = url.auth && url.auth.split(':')[0];
            s.password = url.auth && url.auth.split(':')[1];
        }
        s.host = s.host || 'localhost';
        s.port = parseInt(s.port || '27017', 10);
        s.database = s.database || 'test';
    }

    s.safe = s.safe || false;
    schema.adapter = new MongoDB(s, schema, callback);
    schema.ObjectID = ObjectID;
};

function MongoDB(s, schema, callback) {
    var i, n;
    this.name = 'mongodb';
    this._models = {};
    this.collections = {};

    var server;
    if (s.rs) {
        set = [];
        for (i = 0, n = s.hosts.length; i < n; i++) {
            set.push(new mongodb.Server(s.hosts[i], s.ports[i], {auto_reconnect: true}));
        }
        server = new mongodb.ReplSetServers(set, {rs_name: s.rs});

    } else {
        server = new mongodb.Server(s.host, s.port, {});
    }

    new mongodb.Db(s.database, server, {safe: s.safe}).open(function(err, client) {
        if (err)
            throw err;
        if (s.username && s.password) {
            t = this;
            client.authenticate(s.username, s.password, function(err, result) {
                t.client = client;
                schema.client = client;
                callback();
            });

        } else {
            this.client = client;
            schema.client = client;
            callback();
        }
    }.bind(this));
}

MongoDB.prototype.define = function(descr) {
    if (!descr.settings)
        descr.settings = {};
    var self = this;
    this._models[descr.model.modelName] = descr;
    setTimeout(function() {
        Object.keys(descr.properties).forEach(function(k) {
            if (typeof descr.properties[k].index !== 'undefined' || typeof descr.properties[k].unique !== 'undefined') {
                // console.log(descr.model.modelName)
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

MongoDB.prototype.defineProperty = function(model, prop, params) {
    this._models[model].properties[prop] = params;
};

MongoDB.prototype.collection = function(name) {
    if (!this.collections[name]) {
        this.collections[name] = new mongodb.Collection(this.client, name);
    }
    return this.collections[name];
};

MongoDB.prototype.ensureIndex = function(model, fields, params, callback) {
    this.collection(model).ensureIndex(fields, params);
    return callback(null);
};

MongoDB.prototype.create = function(model, data, callback) {
    if (data.id === null) {
        delete data.id;
    }
    this.collection(model).insert(data, {}, function(err, m) {
        callback(err, err ? null : m[0]._id);
    });
};

MongoDB.prototype.save = function(model, data, callback) {
    var id = data.id;
    id = getObjectId(id);
    this.collection(model).update({_id: id}, data, function(err) {
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
MongoDB.prototype.update = function(model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    filter = filter.where ? filter.where : filter;
    if(filter.id) {
        var id = getObjectId(filter.id);
        filter.id = id;
    }
    this.collection(model).update(filter, data, function(err) {
        callback(err);
    });
};

MongoDB.prototype.exists = function(model, id, callback) {
    id = getObjectId(id);
    this.collection(model).findOne({_id: id}, function(err, data) {
        callback(err, !err && data);
    });
};

MongoDB.prototype.findById = function findById(model, id, callback) {
    id = getObjectId(id);
    this.collection(model).findOne({_id: id}, function(err, data) {
        if (data)
            data.id = id;
        callback(err, data);
    });
};

MongoDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
    var adapter = this;
    if (!data.id)
        return this.create(data, callback);
    this.find(model, data.id, function(err, inst) {
        if (err)
            return callback(err);
        if (inst) {
            adapter.updateAttributes(model, data.id, data, callback);
        } else {
            delete data.id;
            adapter.create(model, data, function(err, id) {
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
    this.collection(model).remove({_id: id}, callback);
};


MongoDB.prototype.remove = function remove(model, filter, callback) {
    var cond = buildWhere(filter.where);
    this.collection(model).remove(cond, callback);
};

MongoDB.prototype.all = function all(model, filter, callback) {
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
        for (index in keys) {
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
    cursor.toArray(function(err, data) {
        if (err)
            return callback(err);
        callback(null, data.map(function(o) {
            o.id = o._id;
            return o;
        }));
    });
};

MongoDB.prototype.destroyAll = function destroyAll(model, callback) {
    this.collection(model).remove({}, callback);
};

MongoDB.prototype.count = function count(model, callback, filter) {
    var cond = buildWhere(filter);
    this.collection(model).count(cond, callback);
};

MongoDB.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    id = getObjectId(id);
    this.collection(model).findAndModify({_id: id}, [['_id', 'asc']], {$set: data}, {}, callback);
};

MongoDB.prototype.disconnect = function() {
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
    Object.keys(filter).forEach(function(k) {
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