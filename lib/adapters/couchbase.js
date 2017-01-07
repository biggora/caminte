/**
 * Module dependencies
 */
var uuid = require('uuid');
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var helpers = utils.helpers;
var couchbase = safeRequire('couchbase');
var CouchBase;

exports.initialize = function (schema, callback) {
    var db, opts;
    opts = schema.settings || {};

    if (!opts.url) {
        var host = opts.host || 'localhost';
        var port = opts.port || '8091';
        var database = opts.database || 'test';
        var proto = opts.ssl ? 'couchbases' : 'couchbase';
        opts.url = proto + '://' + host + ':' + port;
    }
    schema.client = new couchbase.Cluster(opts.url);
    db = schema.client.openBucket(database);
    schema.adapter = new CouchBase(schema.client, db);

    process.nextTick(function () {
        schema.adapter.db = schema.client.openBucket(database);
        return callback && callback();
    }.bind(this));
};

function CouchBase(client, db, callback) {
    this.name = 'couchbase';
    this.client = client;
    this.db = db;
    this._models = {};
}

CouchBase.prototype.define = function (descr) {
    var m, self = this;
    m = descr.model.modelName;
    descr.properties._rev = {
        type: String
    };
    var design = {
        views: {
            all: {
                map: 'function (doc, meta) { if (doc._type === "' + m.toLowerCase() + '") { return emit(doc._type, doc); } }',
                reduce: '_count'
            }
        }
    };
    return self.db.manager().insertDesignDocument('caminte_' + m.toLowerCase(), design, function (err, doc) {
        return self.db.get('caminte_' + m.toLowerCase() + '_counter', function (err, doc) {
            if (!doc) {
                self.db.insert('caminte_' + m.toLowerCase() + '_counter', 0, function () {
                    return self._models[m] = descr;
                });
            } else {
                return self._models[m] = descr;
            }
        });
    });
};

CouchBase.prototype.create = function (model, data, callback) {
    var self = this;
    data._type = model.toLowerCase();
    helpers.savePrep(data);
    return self.db.counter('caminte_' + data._type + '_counter', +1, function (err, res) {
        if (err) {
            console.log('create counter for ' + data._type + ' failed', err);
        }
        var uid = res && res.value ? (data._type + '_' + res.value) : uuid.v1();
        var key = data.id || uid;
        data.id = key;
        return self.db.upsert(key, self.forDB(model, data), function (err, doc) {
            return callback(err, key);
        });
    });
};

CouchBase.prototype.save = function (model, data, callback) {
    var self = this;
    data._type = model.toLowerCase();
    helpers.savePrep(data);
    var uid = uuid.v1();
    var key = data.id || data._id || uid;
    if (data.id) {
        delete data.id;
    }
    if (data._id) {
        delete data._id;
    }
    return self.db.replace(key, self.forDB(model, data), function (err, doc) {
        return callback(err, key);
    });
};

CouchBase.prototype.updateOrCreate = function (model, data, callback) {
    var self = this;
    return self.exists(model, data.id, function (err, exists) {
        if (exists) {
            return self.save(model, data, callback);
        } else {
            return self.create(model, data, function (err, id) {
                data.id = id;
                return callback(err, data);
            });
        }
    });
};

CouchBase.prototype.exists = function (model, id, callback) {
    return this.db.get(id, function (err, doc) {
        if (err) {
            return callback(null, false);
        }
        return callback(null, doc);
    });
};

CouchBase.prototype.findById = function (model, id, callback) {
    var self = this;
    return self.db.get(id, function (err, data) {
        var doc = data && (data.doc || data.value) ? (data.doc || data.value) : null;
        if (doc) {
            if (doc._type) {
                delete doc._type;
            }
            doc = self.fromDB(model, doc);
            if (doc._id) {
                doc.id = doc._id;
                delete doc._id;
            }
        }
        return callback(err, doc);
    });
};

CouchBase.prototype.destroy = function (model, id, callback) {
    var self = this;
    return self.db.remove(id, function (err, doc) {
        if (err) {
            return callback(err);
        }
        callback.removed = true;
        return callback();
    });
};

CouchBase.prototype.updateAttributes = function (model, id, data, callback) {
    var self = this;
    return self.findById(model, id, function (err, base) {
        if (err) {
            return callback(err);
        }
        if (base) {
            data = helpers.merge(base, data);
            data.id = id;
        }
        return self.save(model, data, callback);
    });
};

CouchBase.prototype.count = function (model, callback, where) {
    var self = this;
    var query = new couchbase.ViewQuery()
        .from('caminte_' + model, 'all')
        .reduce(true)
        .stale(1)
        .include_docs(true);
    return self.db.query(query, function (err, body) {
        return callback(err, docs.length);
    });
};

CouchBase.prototype.destroyAll = function (model, callback) {
    var self = this;
    return self.all(model, {}, function (err, docs) {
        return callback(err, docs);
    });
};

CouchBase.prototype.forDB = function (model, data) {
    var k, props, v;
    if (data === null) {
        data = {};
    }
    props = this._models[model].properties;
    for (k in props) {
        v = props[k];
        if (data[k] && props[k].type.name === 'Date'
            && (data[k].getTime !== null)
            && (typeof data[k].getTime === 'function')) {
            data[k] = data[k].getTime();
        }
    }
    return data;
};

CouchBase.prototype.fromDB = function (model, data) {
    var date, k, props, v;
    if (!data) {
        return data;
    }
    props = this._models[model].properties;
    for (k in props) {
        v = props[k];
        if ((data[k] !== null) && props[k].type.name === 'Date') {
            date = new Date(data[k]);
            date.setTime(data[k]);
            data[k] = date;
        }
    }
    return data;
};

CouchBase.prototype.remove = function (model, filter, callback) {
    var self = this;
    return self.all(model, filter, function (err, docs) {
        var doc;
        console.log(docs)
        // return _this.db.bulk({
        //     docs: docs
        //  }, function (err, body) {
        return callback(err, docs);
        //  });
    });
};
/*
 CouchBase.prototype.destroyById = function destroyById(model, id, callback) {
 var self = this;
 return self.db.remove(id, function (err, doc) {
 console.log(err, doc)
 return callback(err, doc);
 });
 };
 */
CouchBase.prototype.all = function (model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var self = this;
    var query = new couchbase.ViewQuery()
        .from('caminte_' + model, 'all')
        .reduce(false)
        .include_docs(true);

    if (filter.order) {
        if (/desc/gi.test()) {
            query.order(couchbase.ViewQuery.Order.DESCENDING);
        }
        // query.order(filter.order);
    }
    if (filter.skip) {
        query.skip(filter.skip);
    }
    if (filter.limit) {
        query.limit(filter.limit);
    }
    if (filter.where) {
        query.custom(filter.where);
    }

    return self.db.query(query, function (err, body) {
        var doc, docs, i, k, key, orders, row, sorting, v, where, _i, _len;
        if (err) {
            if (err.statusCode == 404) {
                return err;
            } else {
                return err;
            }
        }
        docs = body.map(function (row) {
            var item = row.value;
            item.id = row.id;
            return item;
        });
        // console.log('docs:', docs)
        where = filter !== null ? filter.where : void 0;
        if (where) {
            docs = docs ? docs.filter(helpers.applyFilter(filter)) : docs;
        }

        orders = filter !== null ? filter.order : void 0;
        if (orders) {
            if (typeof orders === 'string') {
                orders = [orders];
            }
            sorting = function (a, b) {
                var ak, bk, i, item, rev, _i, _len;
                for (i = _i = 0, _len = this.length; _i < _len; i = ++_i) {
                    item = this[i];
                    ak = a[this[i].key];
                    bk = b[this[i].key];
                    rev = this[i].reverse;
                    if (ak > bk) {
                        return 1 * rev;
                    }
                    if (ak < bk) {
                        return -1 * rev;
                    }
                }
                return 0;
            };
            for (i = _i = 0, _len = orders.length; _i < _len; i = ++_i) {
                key = orders[i];
                orders[i] = {
                    reverse: helpers.reverse(key),
                    key: helpers.stripOrder(key)
                };
            }
            docs.sort(sorting.bind(orders));
        }

        return callback(err, (function () {
            var _j, _len1, _results;
            _results = [];
            for (_j = 0, _len1 = docs.length; _j < _len1; _j++) {
                doc = docs[_j];
                _results.push(this.fromDB(model, doc));
            }
            return _results;
        }).call(self));
    });
};

CouchBase.prototype.autoupdate = function (callback) {
    this.client.manager().createBucket(database, {}, function (err) {
        if (err) console.log('createBucket', err)
        return callback && callback();
    });
};
