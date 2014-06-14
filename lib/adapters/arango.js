/**
 * Module dependencies
 */
var safeRequire = require('../utils').safeRequire;
var helpers = require('../utils').helpers;
var arango = safeRequire('arango');

exports.initialize = function initializeSchema(schema, callback) {
    if (!arango) {
        return;
    }
    var s = schema.settings;

    if (schema.settings.url) {
        var url = require('url').parse(schema.settings.url);
        s.host = url.hostname;
        s.port = url.port || '8529';
        s.database = url.pathname.replace(/^\//, '');
        s.username = url.auth && url.auth.split(':')[0];
        s.password = url.auth && url.auth.split(':')[1];
    }
    s.host = s.host || 'localhost';
    s.port = parseInt(s.port || '8529', 10);
    s.database = s.database || 'test';
    if (!schema.settings.url) {
        var url = schema.settings.host || 'localhost';
        if (schema.settings.port)
            url += ':' + schema.settings.port;
        var auth = '';
        if (schema.settings.username) {
            auth = schema.settings.username;
            if (schema.settings.password) {
                auth += ':' + schema.settings.password;
            }
        }
        if (auth) {
            url = auth + '@' + url;
        }
        url += '/';
        url = 'http://' + url;
        schema.settings.url = url;
    }
    s.safe = s.safe || false;
    schema.adapter = new ArangoDB(s, schema);
    callback();
};

function ArangoDB(s, schema, callback) {
    this.name = 'arango';
    this._models = {};
    this.collections = {};
    this.server = arango.Connection(schema.settings.url);
    this.server.database.create(s.database).then(function(res) {
        console.log("Database created: %j", res);
    }, function(err) {
        if (err.errorNum !== 1207) {
            console.log("Failed to create database: %j", err);
        }
    });

    var db = this.server.use('/' + s.database);
    this.client = db;
    schema.client = db;
}

ArangoDB.prototype.define = function(descr) {
    if (!descr.settings)
        descr.settings = {};
    var self = this;
    this._models[descr.model.modelName] = descr;

    self.client.collection.list().done(function(res) {
        var found = false;
        if (res && res.collections) {
            res.collections.forEach(function(collection) {
                if (collection.name === descr.model.modelName) {
                    found = true;
                }
            });
            if (!found) {
                self.client.collection.create(descr.model.modelName).then(function(res) {
                    console.log("result: %j", res);
                }, function(err) {
                    console.log("error: %j", err);
                });
            }
        }
    });
};

ArangoDB.prototype.defineProperty = function(model, prop, params) {
    this._models[model].properties[prop] = params;
};

ArangoDB.prototype.collection = function(name) {
    if (!this.collections[name]) {
        this.collections[name] = new mongodb.Collection(this.client, name);
    }
    return this.collections[name];
};

ArangoDB.prototype.ensureIndex = function(model, fields, params, callback) {
    this.collection(model).ensureIndex(fields, params);
    return callback(null);
};

ArangoDB.prototype.create = function(model, data, callback) {
    if (data.id === null) {
        delete data.id;
    }
    this.client.document.create(model, data, {createCollection: true})
            .then(function(res) {
                callback(null, res._key, res._rev);
            }, function(err) {
                callback(err, null);
            });
};

ArangoDB.prototype.save = function(model, data, callback) {
    var id = data.id;
    this.collection(model).update({_id: id}, data, function(err) {
        callback(err);
    });
};

ArangoDB.prototype.exists = function(model, id, callback) {
    this.collection(model).findOne({_id: id}, function(err, data) {
        callback(err, !err && data);
    });
};

ArangoDB.prototype.findById = function findById(model, id, callback) {
    //query.count(1).exec({gender:"female",likes:"running"}).then(do_something);
    this.client.document.get(model + '/' + id, function(err, data) {
        if (data) {
            data.id = id;
            delete data._id;
            delete data._key;
            delete data._rev;
        }
        callback(err, data);
    });
};

ArangoDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
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

ArangoDB.prototype.destroy = function destroy(model, id, callback) {
    this.client.document.delete(model + '/' + id, callback);
};


ArangoDB.prototype.remove = function remove(model, filter, callback) {
    var cond = buildWhere(filter.where);
    this.collection(model).remove(cond, callback);
};

ArangoDB.prototype.all = function all(model, filter, callback) {
    var self = this;
    if (!filter) {
        filter = {};
    }
    var query = {};
    if (filter.where) {
        query = buildWhere(filter.where);
    }
    var querys = self.client.query.for('u').in(model)
            .filter('u._key > 0')
            //   .sort('u.id DESC')
            .limit('0, 5')
            .return('{"id": _key}');
    console.log(querys.string);
    self.client.query.count(1).exec("FOR u in " + model + " RETURN u", function(err, dts) {
        console.log("rest: %j", err, dts);
        callback(err, dts);
    });
    /*
     self.client.document.list(model)
     .then(function(res) {
     var documents = [], docIds = [];
     if (res.documents) {
     docIds = res.documents.map(function(d) {
     return /([0-9]+)$/.exec(d)[0];
     });
     var count = docIds.length;
     if (count > 0) {
     docIds.forEach(function(id) {
     self.findById(model, id, function(err, data) {
     if (!err)
     documents.push(data)
     if (--count === 0) {
     return callback && callback(null, documents);
     }
     });
     });
     } else {
     return callback && callback(null, documents);
     }
     } else {
     return callback && callback(null, documents);
     }
     
     }, function(err) {
     return callback && callback(err, null);
     });
     
     
     
     
     
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
     */
};

ArangoDB.prototype.destroyAll = function destroyAll(model, callback) {
    this.collection(model).remove({}, callback);
};

ArangoDB.prototype.count = function count(model, callback, filter) {
    var cond = buildWhere(filter);
    this.collection(model).count(cond, callback);
};

ArangoDB.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    this.collection(model).findAndModify({_id: id}, [['_id', 'asc']], {$set: data}, {}, callback);
};

ArangoDB.prototype.disconnect = function() {
    this.client.close();
};

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