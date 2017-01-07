/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var riak = safeRequire('riak-js');

exports.initialize = function initializeSchema(schema, callback) {
    schema.client = riak.getClient({
        host: schema.settings.host || '127.0.0.1',
        port: schema.settings.port || 8098
    });

    var instrument = {
        'riak.request.start': function (event) {
            console.log('[riak-js] ' + event.method.toUpperCase() + ' ' + event.path);
        }
    }

    schema.client.registerListener(instrument);
    schema.adapter = new Riak(schema.settings, schema, callback);
};

function Riak(s, schema, callback) {
    this.name = 'riak';
    this._models = {};
    this._secondaryIndexes = {};
    this.collections = {};
    this.client = schema.client;
    this.schema = schema;
    this.s = s;
    this.database = s.database || '';
    process.nextTick(callback);
}

Riak.prototype.define = function (descr) {
    var self = this;
    var prop = descr.properties || {};
    for (var key in prop) {
        if (typeof this._secondaryIndexes[descr.model.modelName] === 'undefined') {
            this._secondaryIndexes[descr.model.modelName] = {};
        }
        if (prop[key].index || prop[key].unique) {
            this._secondaryIndexes[descr.model.modelName][key] = prop[key].type.name;
        }
    }
    self.client.getBucket(descr.model.modelName, function (err, properties) {
        self.client.saveBucket(descr.model.modelName, {
            allow_mult: false,
            search: true
        });
    });
    self._models[descr.model.modelName] = descr;
};

Riak.prototype.save = function (model, data, callback) {
    var self = this;
    var opts = self.buildIndexes(model, data);
    if (data.id) {
        self.client.save(model, data.id, data, opts, callback);
    } else {
        self.client.save(model, null, data, function (err, obj, meta) {
            data.id = meta.key;
            self.client.save(model, data.id, data, opts, callback);
        });
    }
};

Riak.prototype.create = function (model, data, callback) {
    this.save(model, data, function (err) {
        if (callback) {
            callback(err, data.id);
        }
    });
};

Riak.prototype.exists = function (model, id, callback) {
    this.client.exists(model, id, function (err, exists, meta) {
        if (callback) {
            callback(err, exists);
        }
    });
};

Riak.prototype.findById = function findById(model, id, callback) {
    this.client.get(model, id, callback);
};

Riak.prototype.destroy = function destroy(model, id, callback) {
    this.client.remove(model, id, callback);
};

Riak.prototype.remove = function (model, filter, callback) {
    var self = this;
    self.all(model, filter, function (err, docs) {
        if (docs) {
            removeOne();
            function removeOne(error) {
                err = err || error;
                var rec = docs.pop();
                if (!rec) {
                    return callback(err && err.statusCode !== '404' ? err : null);
                }
                self.client.remove(model, rec.id, removeOne);
            }
        } else {
            callback(err);
        }
    });
};

Riak.prototype.all = function all(model, filter, callback) {
    var self = this, where;
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var opts = {
        start: 0
    };
    if (filter && filter.where) {
        where = self.buildWhere(model, filter.where);
    }
    if (filter && filter.limit) {
        opts.rows = filter.limit;
    }
    if (filter && filter.skip) {
        opts.start = filter.skip;
    }
    if (filter && filter.order && filter.order !== "") {
        var orderOpts = (filter.order || "").split(' ');
        var orderFields = (orderOpts[0] || "").split(',');
        opts.sort = orderFields[0];
    }
    self.client.getAll(model, {}, opts, function (err, result, meta) {
        if (err) {
            return callback(err, []);
        }

        /*, result
         result = (result || []).map(function(row) {
         // console.log(row);
         return row;
         });result
         */
        return callback(err, result);
    }.bind(this));
};

Riak.prototype.destroyAll = function destroyAll(model, callback) {
    var self = this;
    self.all(model, {}, function (err, recs) {
        if (err) {
            callback(err);
        }
        removeOne();

        function removeOne(error) {
            err = err || error;
            var rec = recs.pop();
            if (!rec) {
                return callback(err && err.statusCode !== '404' ? err : null);
            }
            console.log(rec.id);
            self.client.remove(model, rec.id, removeOne);
        }
    });
};

Riak.prototype.count = function count(model, callback) {
    this.client.count(model, callback);
};

Riak.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    data.id = id;
    this.save(model, data, callback);
};

Riak.prototype.buildIndexes = function buildIndexes(model, data) {
    var idx = this._secondaryIndexes[model], opts = {};
    for (var key in data) {
        if (typeof idx[key] !== 'undefined') {
            var val = data[key];
            if (idx[key] === 'Number' || idx[key] === 'Date') {
                val = parseInt(val);
                if (!isNaN(val)) {
                    opts[key] = val;
                }
            } else {
                if (val !== null) {
                    opts[key] = val;
                }
            }
        }
    }
    return Object.keys(opts).length ? {index: opts} : {};
};

Riak.prototype.buildWhere = function buildWhere(model, data) {
    var idx = this._secondaryIndexes[model], opts = {};
    for (var key in data) {
        if (typeof idx[key] !== 'undefined') {
            var val = data[key];
            if (idx[key] === 'Number' || idx[key] === 'Date') {
                if (typeof val === 'object') {
                    var cond = this.buildCond(key, val);
                    if (cond[key]) {
                        opts[key] = cond[key];
                    }
                } else {
                    val = parseInt(val);
                    if (!isNaN(val)) {
                        opts[key] = val;
                    }
                }
            } else {
                if (val !== null) {
                    opts[key] = val;
                }
            }
        }
    }
    return Object.keys(opts).length ? opts : {};
};

Riak.prototype.buildCond = function buildCond(key, conds) {
    var outs = {};
    console.log(conds)
    Object.keys(conds).forEach(function (condType) {
        var val = conds[condType];
        val = (val.getTime) ? val.getTime() : val;
        switch (condType) {
            case 'gt':
                outs[key] = [parseInt(val) + 1, -1];
                break;
            case 'gte':
                outs[key] = [parseInt(val), -1];
                break;
            case 'lt':
                outs[key] = [-1, parseInt(val)];
                break;
            case 'lte':
                outs[key] = [-1, parseInt(val) - 1];
                break;
            case 'between':
                outs[key] = conds[condType];
                break;
            case 'inq':
            case 'in':

                break;
            case 'nin':

                break;
            case 'neq':
            case 'ne':

                break;
            case 'regex':
            case 'like':

                break;
            case 'nlike':

                break;
            default:

                break;
        }
    });
    return outs;
};

Riak.prototype.fullModelName = function fullModelName(name) {
    return this.database + '_' + name;
};
