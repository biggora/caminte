/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var r = safeRequire('rethinkdb');
var url = require('url');
var fs = require('fs');
var moment = require('moment');
var gpool = require('generic-pool');
var async = require('async');

exports.initialize = function initializeSchema(schema, callback) {
    if (!r) {
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
                var purl = url.parse(uri);
                s.hosts.push(purl.hostname || 'localhost');
                s.ports.push(parseInt(purl.port || '28015', 10));
                if (!s.database)
                    s.database = purl.pathname.replace(/^\//, '');
                if (!s.username)
                    s.username = purl.auth && purl.auth.split(':')[0];
                if (!s.password)
                    s.password = purl.auth && purl.auth.split(':')[1];
            });
        }
        s.database = s.database || 'test';
    } else {
        if (schema.settings.url) {
            var purl = url.parse(schema.settings.url);
            s.host = purl.hostname;
            s.port = purl.port;
            s.database = purl.pathname.replace(/^\//, '');
            s.username = purl.auth && purl.auth.split(':')[0];
            s.password = purl.auth && purl.auth.split(':')[1];
        }
        s.host = s.host || 'localhost';
        s.port = parseInt(s.port || '28015', 10);
        s.database = s.database || 'test';
    }

    s.safe = s.safe || false;

    function connect(cb) {
        r.connect({host: s.host, port: s.port, db: s.database}, function (error, client) {
            if (error) {
                return cb(error, null);
            }
            r.db(s.database).tableList().run(client, function (error) {
                if (error && /database(.*)does\s+not\s+exist/i.test(error.message)) {
                    r.dbCreate(s.database).run(client, function (error) {
                        client.use(s.database);
                        cb(null, client);
                    });
                } else {
                    client.use(s.database);
                    cb(null, client);
                }
            });
        });
    }

    schema.adapter = new RethinkDB(s, schema);
    schema.adapter.pool = gpool.Pool({
        name: "caminte-rethink-pool",
        create: connect,
        destroy: function (client) {
            client.close();
        },
        max: s.poolMax || 10,
        min: s.poolMin || 1,
        idleTimeoutMillis: 30000,
        log: function (what, level) {
            if (level === "error") {
                fs.appendFile("caminte-rethink-pool.log", what + "\r\n");
            }
        }
    });
    process.nextTick(callback);
};

function RethinkDB(s, schema) {
    this.name = 'rethink';
    this._models = {};
    this._foreignKeys = {};
    this.collections = {};
    this.schema = schema;
    this.settings = s;
    this.database = s.database;
}

RethinkDB.prototype.connect = function (cb) {
    cb(); // connection pooling handles it
};

RethinkDB.prototype.define = function (descr) {
    if (!descr.settings)
        descr.settings = {};
    this._models[descr.model.modelName] = descr;
    this._foreignKeys[descr.model.modelName] = [];
};

// creates tables if not exists
RethinkDB.prototype.autoupdate = function (callback) {
    var self = this;
    r.connect({host: self.settings.host, port: self.settings.port}, function (err, client) {
        if (err) {
            return callback && callback(err);
        }
        r.db(self.database).tableList().run(client, function (err, cursor) {
            if (!err && cursor) {
                cursor.toArray(function (err, list) {
                    if (err) {
                        return callback && callback(err);
                    }
                    var timeout = 0;
                    async.eachSeries(Object.keys(self._models), function (model, cb) {
                        var fields = self._models[model].properties;
                        if (list.length === 0 || list.indexOf(model) < 0) {
                            r.db(self.database).tableCreate(model).run(client, function (error) {
                                if (error) {
                                    return cb(error);
                                }
                                timeout = 150;
                                process.nextTick(function() {
                                    self.ensureIndex(model, fields, {}, cb);
                                });
                            });
                        } else {
                            process.nextTick(function() {
                                self.ensureIndex(model, fields, {}, cb);
                            });
                        }
                    }, function (err) {
                        setTimeout(function() {
                            client.close(function() {
                                callback(err);
                            });
                        }, timeout);
                    });
                });
            } else {
                client.close(function() {
                    callback(err);
                });
            }
        });
    });
};

RethinkDB.prototype.ensureIndex = function (model, fields, params, callback) {
    var self = this, indexes = [];
    var properties = fields || self._models[model].properties;
    if (Object.keys(properties).length > 0) {
        r.connect({host: self.settings.host, port: self.settings.port}, function (err, client) {
            if (err) {
                return callback && callback(err);
            }
            Object.keys(properties).forEach(function (property) {
                if ((properties[property].unique || properties[property].index || self._foreignKeys[model].indexOf(property) >= 0)) {
                    indexes.push(property);
                }
            });
            var len = indexes.length;
            if(len === 0) {
                return callback && callback();
            }
            r.db(self.database).table(model).indexList().run(client, function (err, cursor) {
                if (err || !cursor) {
                    return callback && callback(err);
                }
                cursor.toArray(function (err, list) {
                    if (err) {
                        return callback && callback(err);
                    }
                    indexes.forEach(function(index){
                        if(list.indexOf(index) === -1){
                            r.db(self.database).table(model).indexCreate(index).run(client, function (error) {
                                if (error) {
                                    return callback && callback(error);
                                }
                                if (--len === 0) {
                                    process.nextTick(function() {
                                        client.close(function() {
                                            return callback && callback();
                                        });
                                    });
                                }
                            });
                        } else {
                            if (--len === 0) {
                                process.nextTick(function() {
                                    client.close(function() {
                                        return callback && callback();
                                    });
                                });
                            }
                        }
                    });
                });
            });
        });
    } else {
        return callback && callback();
    }
};

// drops tables and re-creates them
RethinkDB.prototype.automigrate = function (callback) {
    this.autoupdate(callback);
};

// checks if database needs to be actualized
RethinkDB.prototype.isActual = function (callback) {
    var self = this;
    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        r.db(self.database).tableList().run(client, function (error, cursor) {
            if (!error) {
                if (cursor.next()) {
                    cursor.toArray(function (error, list) {
                        if (error) {
                            self.pool.release(client);
                            return callback(error);
                        }
                        var actual = true;
                        async.each(Object.keys(self._models), function (model, cb) {
                            if (!actual) {
                                return cb();
                            }
                            var properties = self._models[model].properties;
                            if (list.indexOf(model) < 0) {
                                actual = false;
                                cb();
                            } else {
                                r.db(self.database).table(model).indexList().run(client, function (error, cursor) {
                                    if (error) {
                                        return cb(error);
                                    }
                                    cursor.toArray(function (error, list) {
                                        if (error) {
                                            return cb(error);
                                        }
                                        Object.keys(properties).forEach(function (property) {
                                            if ((properties[property].index || self._foreignKeys[model].indexOf(property) >= 0) && list.indexOf(property) < 0) {
                                                actual = false;
                                            }
                                        });
                                        cb();
                                    });
                                });
                            }
                        }, function (err) {
                            self.pool.release(client);
                            callback(err, actual);
                        });
                    });
                } else if (self._models.length > 0) {
                    self.pool.release(client);
                    callback(null, false);
                }
            } else {
                self.pool.release(client);
                callback(error);
            }
        });
    });
};

RethinkDB.prototype.defineForeignKey = function (name, key, cb) {
    this._foreignKeys[name].push(key);
    cb(null, String);
};

RethinkDB.prototype.create = function (model, data, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;

        if (data.id === null || data.id === undefined) {
            delete data.id;
        }
        Object.keys(data).forEach(function (key) {
            if (data[key] instanceof Date) {
                data[key] = moment(data[key]).unix();
            }
            if (data[key] === undefined) {
                data[key] = null;
            }
        });
        r.db(self.database).table(model).insert(data).run(client, function (err, m) {
            self.pool.release(client);
            err = err || m.first_error && new Error(m.first_error);
            if (m.generated_keys) {
                data.id = m.generated_keys[0];
            }
            callback(err, err ? null : data.id);
        });
    });
};

RethinkDB.prototype.save = function (model, data, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;

        Object.keys(data).forEach(function (key) {
            if (data[key] instanceof Date)
                data[key] = moment(data[key]).unix();
            if (data[key] === undefined)
                data[key] = null;
        });
        r.db(self.database).table(model).insert(data, {conflict: 'replace'}).run(client, function (err, notice) {
            self.pool.release(client);
            err = err || notice.first_error && new Error(notice.first_error);
            callback(err, notice);
        });
    });
};

RethinkDB.prototype.exists = function (model, id, callback) {
    var self = this;
    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        r.db(self.database).table(model).get(id).run(client, function (err, data) {
            self.pool.release(client);
            callback(err, !!(!err && data));
        });
    });
};

RethinkDB.prototype.findById = function findById(model, id, callback) {
    var self = this;
    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        r.db(self.database).table(model).get(id).run(client, function (err, data) {
            if (data)
                Object.keys(data).forEach(function (key) {
                    if (self._models[model].properties[key]['type']['name'] === "Date")
                        data[key] = moment.unix(data[key]).toDate();
                }.bind(self));
            self.pool.release(client);
            callback(err, data);
        }.bind(self));
    });
};

RethinkDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
    var self = this;
    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        if (data.id === null || data.id === undefined) {
            delete data.id;
        }
        data.forEach(function (value, key) {
            if (value instanceof Date) {
                data[key] = moment(value).unix();
            }
            if (value === undefined) {
                data[key] = null;
            }
        });
        r.db(self.database).table(model).insert(data, {conflict: 'replace'}).run(client, function (err, m) {
            self.pool.release(client);
            err = err || m.first_error && new Error(m.first_error);
            callback(err, err ? null : m['generated_keys'][0]);
        });
    });
};

RethinkDB.prototype.destroy = function destroy(model, id, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;

        r.db(self.database).table(model).get(id).delete().run(client, function (error, result) {
            self.pool.release(client);
            callback(error);
        });
    });
};

RethinkDB.prototype.remove = function remove(model, filter, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;

        if (!filter) {
            filter = {};
        }

        var promise = r.db(self.database).table(model);

        if (filter.where) {
            promise = _processWhere(self, model, filter.where, promise);
        }

        if (filter.skip) {
            promise = promise.skip(filter.skip);
        } else if (filter.offset) {
            promise = promise.skip(filter.offset);
        }
        if (filter.limit) {
            promise = promise.limit(filter.limit);
        }

        _keys = self._models[model].properties;
        _model = self._models[model].model;

        promise.delete().run(client, function (error, cursor) {
            self.pool.release(client);
            callback(error);
        });
    }, 0); // high-priority pooling
};

RethinkDB.prototype.all = function all(model, filter, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;

        if (!filter) {
            filter = {};
        }

        var promise = r.db(self.database).table(model);

        if (filter.where) {
            promise = _processWhere(self, model, filter.where, promise);
        }

        if (filter.order) {
            var keys = filter.order;
            if (typeof keys === 'string') {
                keys = keys.split(',');
            }
            keys.forEach(function (key) {
                var m = key.match(/\s+(A|DE)SC$/);
                key = key.replace(/\s+(A|DE)SC$/, '').trim();
                if (m && m[1] === 'DE') {
                    promise = promise.orderBy(r.desc(key));
                } else {
                    promise = promise.orderBy(r.asc(key));
                }
            });
        } else {
            // default sort by id
            promise = promise.orderBy(r.asc("id"));
        }

        if (filter.skip) {
            promise = promise.skip(filter.skip);
        } else if (filter.offset) {
            promise = promise.skip(filter.offset);
        }
        if (filter.limit) {
            promise = promise.limit(filter.limit);
        }

        _keys = self._models[model].properties;
        _model = self._models[model].model;

        promise.run(client, function (error, cursor) {
            if (error) {
                self.pool.release(client);
                callback(error, null);
            }
            cursor.toArray(function (err, data) {
                if (err) {
                    self.pool.release(client);
                    return callback(err);
                }

                data.forEach(function (element, index) {
                    Object.keys(element).forEach(function (key) {
                        if (!_keys.hasOwnProperty(key))
                            return;
                        if (_keys[key]['type']['name'] === "Date")
                            element[key] = moment.unix(element[key]).toDate();
                    });
                    data[index] = element;
                });

                self.pool.release(client);

                if (filter && filter.include && filter.include.length > 0) {
                    _model.include(data, filter.include, callback);
                } else {
                    callback(null, data);
                }
            });
        });
    }, 0); // high-priority pooling
};

RethinkDB.prototype.destroyAll = function destroyAll(model, callback) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error)
            throw error;
        r.db(self.database).table(model).delete().run(client, function (error, result) {
            self.pool.release(client);
            callback(error, result);
        });
    });
};

RethinkDB.prototype.count = function count(model, callback, where) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        var promise = r.db(self.database).table(model);

        if (where && typeof where === "object") {
            promise = _processWhere(self, model, where, promise);
        }
        promise.count().run(client, function (err, count) {
            self.pool.release(client);
            callback(err, count);
        });
    });
};

RethinkDB.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
    var self = this;

    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        data.id = id;
        Object.keys(data).forEach(function (key) {
            if (data[key] instanceof Date) {
                data[key] = moment(data[key]).unix();
            }
            if (data[key] === undefined) {
                data[key] = null;
            }
        });
        r.db(self.database)
            .table(model)
            .update(data)
            .run(client, function (err, object) {
                self.pool.release(client);
                cb(err, data);
            });
    });
};

RethinkDB.prototype.update = function (model, filter, data, cb) {
    var self = this;
    self.pool.acquire(function (error, client) {
        if (error) {
            throw error;
        }
        r.db(self.database).table(model)
            .filter(filter)
            .update(data)
            .run(client, function (err, object) {
                self.pool.release(client);
                cb(err, data);
            });
    });
};

RethinkDB.prototype.disconnect = function () {
    var self = this;
    self.pool.drain(function () {
        self.pool.destroyAllNow();
    });
};

function _processWhere(self, model, where, promise) {
    //Transform promise (a rethinkdb query) based on the given where clause.
    //Returns the modified promise
    var i, m, keys;
    var indexed = false;
    var queryParts = [];
    var queryExtra = [];
    Object.keys(where).forEach(function (k) {
        var spec, cond = where[k];
        var allConds = [];
        if (cond && cond.constructor.name === 'Object') {
            keys = Object.keys(cond);
            for (i = 0, m = keys.length; i < m; i++) {
                allConds.push([keys[i], cond[keys[i]]]);
            }
        }
        else {
            allConds.push([false, cond]);
        }
        var hasIndex = self._models[model].properties[k].index || self._foreignKeys[model].indexOf(k) >= 0;
        for (i = 0, m = allConds.length; i < m; i++) {
            spec = allConds[i][0];
            cond = allConds[i][1];
            if (cond instanceof Date) {
                cond = moment(cond).unix();
            }
            switch (spec) {
                case false:
                    if (!indexed && hasIndex) {
                        promise = promise.getAll(cond, {index: k});
                        indexed = true;
                    } else {
                        queryParts.push(r.row(k).eq(cond));
                    }
                    break;
                case 'between':
                    queryParts.push(r.row(k).ge(cond[0]).and(r.row(k).le(cond[1])));
                    break;
                case 'in':
                case 'inq':
                    var expr1 = '(function(row) { return ' + JSON.stringify(cond) + '.indexOf(row.' + k + ') >= 0 })';
                    queryExtra.push(r.js(expr1));
                    break;
                case 'nin':
                    var expr2 = '(function(row) { return ' + JSON.stringify(cond) + '.indexOf(row.' + k + ') === -1 })';
                    queryExtra.push(r.js(expr2));
                    break;
                case 'gt':
                    queryParts.push(r.row(k).gt(cond));
                    break;
                case 'gte':
                    queryParts.push(r.row(k).ge(cond));
                    break;
                case 'lt':
                    queryParts.push(r.row(k).lt(cond));
                    break;
                case 'lte':
                    queryParts.push(r.row(k).le(cond));
                    break;
                case 'ne':
                case 'neq':
                    queryParts.push(r.row(k).ne(cond));
                    break;
            }
        }
    });

    var query;
    queryParts.forEach(function (comp) {
        if (!query) {
            query = comp;
        } else {
            query = query.and(comp);
        }
    });
    if (query) {
        promise = promise.filter(query);
    }
    queryExtra.forEach(function (comp) {
        promise = promise.filter(comp);
    });

    return promise;
}
