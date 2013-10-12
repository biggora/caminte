exports.initialize = function initializeSchema(schema, callback) {
    schema.adapter = new Memory();
    process.nextTick(callback);
};

function Memory() {
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


Memory.prototype.toDatabase = function(model, data) {
    var properties = this._models[model].properties, cleaned = {};

    Object.keys(data).forEach(function(key) {
        if (properties[key].type.name === 'Date') {
            if (data[key].getTime) {
                cleaned[key] = data[key].getTime();
            } else {
                cleaned[key] = data[key];
            }
        } else {
            cleaned[key] = data[key];
        }
    });
    return cleaned;
};

Memory.prototype.create = function create(model, data, callback) {
    var id = data.id || this.ids[model]++;
    data.id = id;
    this.cache[model][id] = this.toDatabase(model, data);
    process.nextTick(function() {
        callback(null, id);
    });
};

Memory.prototype.updateOrCreate = function(model, data, callback) {
    var mem = this;
    this.exists(model, data.id, function(err, exists) {
        if (exists) {
            mem.save(model, data, callback);
        } else {
            mem.create(model, data, function(err, id) {
                data.id = id;
                callback(err, data);
            });
        }
    });
};

Memory.prototype.save = function save(model, data, callback) {
    this.cache[model][data.id] = data;
    process.nextTick(function() {
        callback(null, data);
    });
};

Memory.prototype.exists = function exists(model, id, callback) {
    process.nextTick(function() {
        callback(null, this.cache[model].hasOwnProperty(id));
    }.bind(this));
};

Memory.prototype.findById = function findById(model, id, callback) {
    process.nextTick(function() {
        callback(null, this.cache[model][id]);
    }.bind(this));
};

Memory.prototype.destroy = function destroy(model, id, callback) {
    delete this.cache[model][id];
    process.nextTick(callback);
};

Memory.prototype.remove = function remove(model, filter, callback) {
    var self = this;
    self.all(model, filter, function(err, nodes) {
        var count = nodes.length;
        if (count > 0) {
            nodes.forEach(function(node) {
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
    var nodes = Object.keys(this.cache[model]).map(function(key) {
        return this.cache[model][key];
    }.bind(this));

    if (filter) {

        // do we need some filtration?
        if (filter.where) {
            nodes = nodes ? nodes.filter(applyFilter(filter)) : nodes;
        }

        // do we need some sorting?
        if (filter.order) {
            var props = this._models[model].properties;
            var orders = filter.order;
            if (typeof filter.order === "string") {
                orders = [filter.order];
            }
            orders.forEach(function(key, i) {
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

    process.nextTick(function() {
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

function applyFilter(filter) {
    if (typeof filter.where === 'function') {
        return filter.where;
    }
    var keys = Object.keys(filter.where);
    return function(obj) {
        var pass = true;
        keys.forEach(function(key) {
            if (typeof filter.where[key] === 'object') {
                pass = parseCond(obj[key], filter.where[key])
                console.log(pass, filter.where[key])
            } else {
                if (!testString(filter.where[key], obj[key])) {
                    pass = false;
                }
            }
        });
        return pass;
    };

    function testString(example, value) {
        if (typeof value === 'string' && example && example.constructor.name === 'RegExp') {
            return value.match(example);
        }
        // not strict equality
        return (example !== null ? example.toString() : example) === (value !== null ? value.toString() : value);
    }
}

Memory.prototype.destroyAll = function destroyAll(model, callback) {
    Object.keys(this.cache[model]).forEach(function(id) {
        delete this.cache[model][id];
    }.bind(this));
    this.cache[model] = {};
    process.nextTick(callback);
};

Memory.prototype.count = function count(model, callback, where) {
    var cache = this.cache[model];
    var data = Object.keys(cache);
    if (where) {
        data = data.filter(function(id) {
            var ok = true;
            Object.keys(where).forEach(function(key) {
                if (cache[id][key] !== where[key]) {
                    ok = false;
                }
            });
            return ok;
        });
    }
    process.nextTick(function() {
        callback(null, data.length);
    });
};

Memory.prototype.updateAttributes = function updateAttributes(model, id, data, cb) {
    data.id = id;
    var base = this.cache[model][id];
    this.save(model, merge(base, data), cb);
};

function merge(base, update) {
    if (!base)
        return update;
    Object.keys(update).forEach(function(key) {
        base[key] = update[key];
    });
    return base;
}

function parseCond(val, conds) {
    var outs = false;
    Object.keys(conds).forEach(function(condType) {
        switch (condType) {
            case 'gt':
                outs = val > conds[condType] ? true : false;
                break;
            case 'gte':
                outs = val >= conds[condType] ? true : false;
                break;
            case 'lt':
                outs = val < conds[condType] ? true : false;
                break;
            case 'lte':
                outs = val <= conds[condType] ? true : false;
                break;
            case 'between':
                // need
                outs = val !== conds[condType] ? true : false;
                break;
            case 'inq':
            case 'in':
                conds[condType].forEach(function(cval){
                    if(val === cval) {
                        outs = true;
                    }
                });                
                break;
            case 'nin':
                conds[condType].forEach(function(cval){
                    if(val === cval) {
                        outs = false;
                    }
                });
                break;
            case 'neq':
            case 'ne':
                outs = val !== conds[condType] ? true : false;
                break;
            case 'regex':
            case 'like':
                outs = new RegExp(conds[condType]).test(val);
                break;
            case 'nlike':
                outs = !new RegExp(conds[condType]).test(val);
                break;
            default:
                outs = val === conds[condType] ? true : false;
                break;
        }
    });
    return outs;
}