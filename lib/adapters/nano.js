/**
 * Module dependencies
 */
var url = require('url');
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var helpers = utils.helpers;
var nano = safeRequire('nano');
var NanoAdapter;

exports.initialize = function (schema, callback) {
    var db, server, opts, srvuri, database;
    opts = schema.settings || {};

    if (!opts.url) {
        var host = opts.host || 'localhost';
        var port = opts.port || '5984';
        var proto = opts.ssl ? 'https' : 'http';
        database = opts.database || 'test';
        opts.url = proto + '://' + host + ':' + port + '/' + database;
        srvuri = proto + '://' + host + ':' + port;
    } else {
        var parsed_url = url.parse(opts.url);
        database = (parsed_url.path || parsed_url.pathname || '').replace(/\//g, '');
        srvuri = (opts.url || '').replace(parsed_url.path, '');
    }
    db = nano(opts);
    server = nano(srvuri);
    server.db.create(database, function (err, body) {
        if (!err) {
            console.log('database ' + database + ' created!');
        }
    });

    schema.adapter = new NanoAdapter(db, callback);

};

function NanoAdapter(db, callback) {
    this.name = 'nano';
    this.db = db;
    this.all = helpers.__bind(this.all, this);
    this.fromDB = helpers.__bind(this.fromDB, this);
    this.forDB = helpers.__bind(this.forDB, this);
    this.destroyAll = helpers.__bind(this.destroyAll, this);
    this.count = helpers.__bind(this.count, this);
    this.updateAttributes = helpers.__bind(this.updateAttributes, this);
    this.destroy = helpers.__bind(this.destroy, this);
    this.findById = helpers.__bind(this.findById, this);
    this.findOne = helpers.__bind(this.findOne, this);
    this.exists = helpers.__bind(this.exists, this);
    this.updateOrCreate = helpers.__bind(this.updateOrCreate, this);
    this.save = helpers.__bind(this.save, this);
    this.create = helpers.__bind(this.create, this);
    this.remove = helpers.__bind(this.remove, this);
    this.define = helpers.__bind(this.define, this);
    this._models = {};
    process.nextTick(function () {
        callback();
    });
}

NanoAdapter.prototype.define = function (descr) {
    var m, self = this;
    m = descr.model.modelName;
    descr.properties._rev = {
        type: String
    };

    var design = {
        views: {
            all: {
                map: 'function (doc) { if (doc.model === "' + m + '") { return emit(doc.model, doc); } }'
            }
        },
        updates: {
            modify: "function (doc, req) { var fields = JSON.parse(req.body); for (var i in fields) { doc[i] = fields[i]; } return [doc, toJSON(doc)];}"
        }
    };// var resp = eval(uneval(doc)); 
    return self.db.insert(design, '_design/caminte_' + m, function (err, doc) {
        return self._models[m] = descr;
    });
};

NanoAdapter.prototype.create = function (model, data, callback) {
    var _this = this;
    data.model = model;
    helpers.savePrep(data);
    return this.db.insert(this.forDB(model, data), function (err, doc) {
        if (err) {
            doc = data;
            console.log('###    error create:', err.message, doc.id || doc._id, doc._rev)
        }
        return callback(err, doc.id, doc.rev);
    });
};

NanoAdapter.prototype.save = function (model, data, callback) {
    var _this = this, id;
    data.model = model;
    helpers.savePrep(data);
    var item = this.forDB(model, data);
    id = item._id;
    item.up = Date.now();
    return this.db.insert(item, id, function (err, doc) {
        // return this.db.atomic("caminte_" + model, "modify", id, item, function (err, doc) {
        if (err && err.statusCode != 409) {
            console.log('###             error save:', err)
        } else if (err && err.statusCode == 409) {
            doc = item;
            err = null;
        }
        return callback(err, doc.id, doc.rev);
    });
};

NanoAdapter.prototype.updateOrCreate = function (model, data, callback) {
    var _this = this;
    return this.exists(model, data.id, function (err, exists) {
        if (exists) {
            return _this.save(model, data, callback);
        } else {
            return _this.create(model, data, function (err, id) {
                data.id = id;
                return callback(err, data);
            });
        }
    });
};

NanoAdapter.prototype.exists = function (model, id, callback) {
    return this.db.head(id, function (err, _, headers) {
        if (err) {
            return callback(null, false);
        }
        return callback(null, headers !== null);
    });
};

NanoAdapter.prototype.findById = function (model, id, callback) {
    var _this = this;
    return this.db.get(id, function (err, doc) {
        return callback(err, _this.fromDB(model, doc));
    });
};

NanoAdapter.prototype.destroy = function (model, id, callback) {
    var _this = this;
    return this.db.get(id, function (err, doc) {
        if (err) {
            return callback(err);
        }
        return _this.db.destroy(id, doc._rev, function (err, doc) {
            if (err) {
                return callback(err);
            }
            callback.removed = true;
            return callback();
        });
    });
};

NanoAdapter.prototype.updateAttributes = function (model, id, data, callback) {
    var _this = this;
    return this.db.get(id, function (err, base) {
        if (err) {
            return callback(err);
        }
        return _this.save(model, helpers.merge(base, data), callback);
    });
};

NanoAdapter.prototype.count = function (model, callback, where) {
    var _this = this;
    return _this.all(model, {
        where: where
    }, function (err, docs) {
        return callback(err, docs.length);
    });
};

NanoAdapter.prototype.destroyAll = function (model, callback) {
    var _this = this;
    return _this.all(model, {}, function (err, docs) {
        var doc;
        docs = (function () {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = docs.length; _i < _len; _i++) {
                doc = docs[_i];
                _results.push({
                    _id: doc.id,
                    _rev: doc._rev,
                    _deleted: true
                });
            }
            return _results;
        })();
        return _this.db.bulk({
            docs: docs
        }, function (err, body) {
            return callback(err, body);
        });
    });
};

NanoAdapter.prototype.forDB = function (model, data) {
    var k, props, v;
    if (data === null) {
        data = {};
    }
    props = this._models[model].properties;
    for (k in props) {
        v = props[k];
        if (data[k] && v.type.name === 'Date'
            && (data[k].getTime !== null)
            && (typeof data[k].getTime === 'function')) {
            data[k] = data[k].getTime();
        }
    }
    for (f in data) {
        if (typeof data[f] === 'function') {
            delete data[f];
        }
    }
    return data;
};

NanoAdapter.prototype.fromDB = function (model, data) {
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

NanoAdapter.prototype.remove = function (model, filter, callback) {
    var _this = this;
    return _this.all(model, filter, function (err, docs) {
        var doc;
        docs = (function () {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = docs.length; _i < _len; _i++) {
                doc = docs[_i];
                _results.push({
                    _id: doc.id,
                    _rev: doc._rev,
                    _deleted: true
                });
            }
            return _results;
        })();
        return _this.db.bulk({
            docs: docs
        }, function (err, body) {
            return callback(err, body);
        });
    });
};


NanoAdapter.prototype.all = function (model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var _this = this;
    var vopts = {
        include_docs: true
    };

    return this.db.view('caminte_' + model, 'all', vopts, function (err, body) {
        var doc, docs, i, k, key, orders, row, sorting, v, where, _i, _len;
        if (err) console.log(err)
        docs = (function () {
            var _i, _len, _ref, _results;
            _ref = body.rows;
            _results = [];
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                row = _ref[_i];
                row.doc = row.value;
                row.doc.id = row.doc._id;
                delete row.doc._id;
                _results.push(row.doc);
            }
            return _results;
        })();

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
        }).call(_this));
    });
};