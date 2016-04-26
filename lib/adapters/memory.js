/**
 * Module dependencies
 */
var utils = require('../utils');
var helpers = utils.helpers;

exports.initialize = function initializeSchema(schema, callback) {
    schema.adapter = new Memory();
    process.nextTick(callback);
};

function Memory() {
    this.name = 'memory';
    this._models = {};
    this.cache = {};
    this.ids = {};
}

Memory.prototype.define = function defineModel(descr) {
    var m = descr.model.modelName;
    this._models[m] = descr;
    this.cache[m] = {};
    this.ids[m] = 1;
};

Memory.prototype.toDatabase = function (model, data) {
    var cleaned = {};
    Object.keys(data).forEach(function (key) {
        cleaned[key] = data[key];
    });
    return cleaned;
};

Memory.prototype.create = function create(model, data, callback) {
    var id = data.id || this.ids[model]++;
    data.id = id;
    this.cache[model][id] = this.toDatabase(model, data);
    process.nextTick(function () {
        callback(null, id);
    });
};

Memory.prototype.updateOrCreate = function (model, data, callback) {
    var mem = this;
    this.exists(model, data.id, function (err, exists) {
        if (exists) {
            mem.save(model, data, callback);
        } else {
            mem.create(model, data, function (err, id) {
                data.id = id;
                callback(err, data);
            });
        }
    });
};

Memory.prototype.save = function save(model, data, callback) {
    this.cache[model][data.id] = data;
    process.nextTick(function () {
        callback(null, data);
    });
};

Memory.prototype.exists = function exists(model, id, callback) {
    process.nextTick(function () {
        callback(null, this.cache[model].hasOwnProperty(id));
    }.bind(this));
};

Memory.prototype.findById = function findById(model, id, callback) {
    process.nextTick(function () {
        callback(null, this.cache[model][id]);
    }.bind(this));
};

Memory.prototype.destroy = function destroy(model, id, callback) {
    delete this.cache[model][id];
    process.nextTick(callback);
};

Memory.prototype.remove = function remove(model, filter, callback) {
    var self = this;
    self.all(model, filter, function (err, nodes) {
        var count = nodes.length;
        if (count > 0) {
            nodes.forEach(function (node) {
                delete self.cache[model][node.id];
                if (--count === 0) {
                    callback();
                }
            });
        } else {
            callback();
        }
    });
};

Memory.prototype.all = function all(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var nodes = Object.keys(this.cache[model]).map(function (key) {
        return this.cache[model][key];
    }.bind(this));

    if (filter) {

        // do we need some filtration?
        if (filter.where) {
            nodes = nodes ? nodes.filter(helpers.applyFilter(filter)) : nodes;
        }

        // do we need some sorting?
        if (filter.order) {
            var props = this._models[model].properties;
            var orders = filter.order;
            if (typeof filter.order === "string") {
                orders = [filter.order];
            }
            orders.forEach(function (key, i) {
                var reverse = 1;
                var m = key.match(/\s+(A|DE)SC$/i);
                if (m) {
                    key = key.replace(/\s+(A|DE)SC/i, '');
                    if (m[1] === 'DE')
                        reverse = -1;
                }
                orders[i] = {"key": key, "reverse": reverse};
            });
            nodes = nodes.sort(sorting.bind(orders));
        }
    }

    process.nextTick(function () {
        callback(null, nodes);
    });

    function sorting(a, b) {
        for (var i = 0, l = this.length; i < l; i++) {
            if (a[this[i].key] > b[this[i].key]) {
                return 1 * this[i].reverse;
            } else if (a[this[i].key] < b[this[i].key]) {
                return -1 * this[i].reverse;
            }
        }
        return 0;
    }
};

Memory.prototype.destroyAll = function destroyAll(model, callback) {
    Object.keys(this.cache[model]).forEach(function (id) {
        delete this.cache[model][id];
    }.bind(this));
    this.cache[model] = {};
    process.nextTick(callback);
};

Memory.prototype.count = function count(model, callback, where) {
    var cache = this.cache[model];
    var data = Object.keys(cache);
    if (where) {
        data = data.filter(function (id) {
            var ok = true;
            Object.keys(where).forEach(function (key) {
                if (cache[id][key] !== where[key]) {
                    ok = false;
                }
            });
            return ok;
        });
    }
    process.nextTick(function () {
        callback(null, data.length);
    });
};

Memory.prototype.updateAttributes = function updateAttributes(model, id, data, cb) {
    data.id = id;
    var base = this.cache[model][id];
    this.save(model, helpers.merge(base, data), cb);
};