/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var mongoose = safeRequire('mongoose');

exports.initialize = function initializeSchema(schema, callback) {
    if (!mongoose) {
        return;
    }

    if (!schema.settings.url) {
        var url = schema.settings.host || 'localhost';
        if (schema.settings.port) url += ':' + schema.settings.port;
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
        if (schema.settings.database) {
            url += '/' + schema.settings.database;
        } else {
            url += '/';
        }
        url = 'mongodb://' + url;
        schema.settings.url = url;
    }
    if (!schema.settings.rs) {
        schema.client = mongoose.connect(schema.settings.url);
    } else {
        schema.client = mongoose.createConnection(schema.settings.url, {
            rs_name: schema.settings.rs
        });
    }

    schema.adapter = new MongooseAdapter(schema.client);
    process.nextTick(callback);
};

function MongooseAdapter(client) {
    this.name = 'mongoose';
    this._models = {};
    this.client = client;
    this.cache = {};
}

MongooseAdapter.prototype.define = function (descr) {
    var props = {};
    Object.keys(descr.properties).forEach(function (key) {
        props[key] = {};
        props[key].type = descr.properties[key].type;
        if (props[key].type.name === 'Text') {
            props[key].type = String;
        }
        if (props[key].type.name === 'Object' || props[key].type.name === 'JSON') {
            props[key].type = mongoose.Schema.Types.Mixed;
        }
        if (descr.properties[key].index) {
            props[key].index = descr.properties[key].index;
        }
    });
    var schema = new mongoose.Schema(props);
    this._models[descr.model.modelName] = mongoose.model(descr.model.modelName, schema, descr.settings.table || null);
    this.cache[descr.model.modelName] = {};
};

MongooseAdapter.prototype.defineForeignKey = function (model, key, cb) {
    var piece = {};
    piece[key] = {
        type: mongoose.Schema.ObjectId,
        index: true
    };
    this._models[model].schema.add(piece);
    cb(null, String);
};

MongooseAdapter.prototype.setCache = function (model, instance) {
    this.cache[model][instance.id] = instance;
};

MongooseAdapter.prototype.getCached = function (model, id, cb) {
    if (this.cache[model][id]) {
        cb(null, this.cache[model][id]);
    } else {
        this._models[model].findById(id, function (err, instance) {
            if (err) {
                return cb(err);
            }
            this.cache[model][id] = instance;
            cb(null, instance);
        }.bind(this));
    }
};

MongooseAdapter.prototype.create = function (model, data, callback) {
    var m = new this._models[model](data);
    m.save(function (err) {
        callback(err, err ? null : m.id);
    });
};

MongooseAdapter.prototype.save = function (model, data, callback) {
    this.getCached(model, data.id, function (err, inst) {
        if (err) {
            return callback(err);
        }
        merge(inst, data);
        inst.save(callback);
    });
};

MongooseAdapter.prototype.exists = function (model, id, callback) {
    delete this.cache[model][id];
    this.getCached(model, id, function (err, data) {
        if (err) {
            return callback(err);
        }
        callback(err, !!data);
    });
};

MongooseAdapter.prototype.findOne = function findOne(model, filter, fields, options, cb) {
    if ('function' === typeof options) {
        cb = options;
        options = null;
    } else if ('function' === typeof fields) {
        cb = fields;
        fields = null;
        options = null;
    } else if ('function' === typeof filter) {
        cb = filter;
        filter = {};
        fields = null;
        options = null;
    }
    if (!filter) {
        filter = {};
    }
    var query = this._models[model].findOne({}, options);
    if (fields) {
        query.select(fields);
    }
    if (filter.where) {
        Object.keys(filter.where).forEach(function (k) {
            var cond = filter.where[k];
            var spec = false;
            if (cond && cond.constructor.name === 'Object') {
                spec = Object.keys(cond)[0];
                cond = cond[spec];
            }
            if (spec) {
                if (spec === 'between') {
                    query.where(k).gte(cond[0]).lte(cond[1]);
                } else {
                    query.where(k)[spec](cond);
                }
            } else {
                query.where(k, cond);
            }
        });
    }

    query.exec(function (err, data) {
        if (err) return cb(err);
        cb(null, data);
    });
};

MongooseAdapter.prototype.findById = function find(model, id, callback) {
    delete this.cache[model][id];
    this.getCached(model, id, function (err, data) {
        if (err) {
            return callback(err);
        }
        callback(err, data ? data.toObject() : null);
    });
};

MongooseAdapter.prototype.all = function all(model, filter, cb) {

    var options = {};
    if ('function' === typeof filter) {
        cb = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    if (filter.options) {
        options = filter.options;
    }

    var query = this._models[model].find({}, options);

    if (filter.where) {
        Object.keys(filter.where).forEach(function (k) {
            var cond = filter.where[k];
            var spec = false;
            if (cond && cond.constructor.name === 'Object') {
                spec = Object.keys(cond)[0];
                cond = cond[spec];
            }
            if (spec) {
                switch (spec) {
                    case "between":
                        query.where(k).gte(cond[0]).lte(cond[1]);
                        break;
                    case "regex":
                    case "like":
                        query.where(k, new RegExp(cond, 'i'));
                        break;
                    case "nlike":
                        query.where(k).not(new RegExp(cond, 'i'));
                        break;
                    case "inq":
                        query.where(k)['in'](cond);
                        break;
                    default:
                        query.where(k)[spec](cond);
                }

            } else {
                query.where(k, cond);
            }
        });
    }
    if (filter.fields) {
        query.select(filter.fields);
    }
    if (filter.order) {
        var keys = filter.order; // can be Array or String
        if (typeof(keys) === "string") {
            keys = keys.split(',');
        }

        for (index in keys) {
            var m = keys[index].match(/\s+(A|DE)SC$/);

            keys[index] = keys[index].replace(/\s+(A|DE)SC$/, '');
            if (parseInt(mongoose.version.substr(0, 1)) >= 3) {
                if (m && m[1] === 'DE') {
                    query.sort('-' + keys[index].trim());
                } else {
                    query.sort(keys[index].trim());
                }
            } else {
                if (m && m[1] === 'DE') {
                    query.desc(keys[index].trim());
                } else {
                    query.asc(keys[index].trim());
                }
            }
        }
    }
    if (filter.limit) {
        query.limit(filter.limit);
    }
    if (filter.skip) {
        query.skip(filter.skip);
    } else if (filter.offset) {
        query.skip(filter.offset);
    }
    query.exec(function (err, data) {
        if (err) return cb(err);
        cb(null, data);
    });
};


MongooseAdapter.prototype.remove = function remove(model, filter, cb) {

    var options = {};
    if ('function' === typeof filter) {
        cb = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    if (filter.options) {
        options = filter.options;
    }

    var query = this._models[model].find({}, options);

    if (filter.where) {
        Object.keys(filter.where).forEach(function (k) {
            var cond = filter.where[k];
            var spec = false;
            if (cond && cond.constructor.name === 'Object') {
                spec = Object.keys(cond)[0];
                cond = cond[spec];
            }
            if (spec) {
                switch (spec) {
                    case "between":
                        query.where(k).gte(cond[0]).lte(cond[1]);
                        break;
                    case "regex":
                    case "like":
                        query.where(k, new RegExp(cond, 'i'));
                        break;
                    case "nlike":
                        query.where(k).not(new RegExp(cond, 'i'));
                        break;
                    case "inq":
                        query.where(k)['in'](cond);
                        break;
                    default:
                        query.where(k)[spec](cond);
                }

            } else {
                query.where(k, cond);
            }
        });
    }

    query.exec(function (err, data) {
        if (err) return cb(err);
        if (data) {
            var count = data.length || 0;
            for (var i in data) {
                if (typeof data[i] !== 'undefined') {
                    data[i].remove(function () {
                        if (--count === 0) {
                            cb(null, data);
                        }
                    });
                } else {
                    if (--count === 0) {
                        cb(null, data);
                    }
                }
            }
        } else {
            cb(null, data);
        }
    });
};

MongooseAdapter.prototype.destroy = function destroy(model, id, cb) {
    this.getCached(model, id, function (err, data) {
        if (err) {
            return cb(err);
        }
        if (data) {
            data.remove(cb);
        } else {
            cb(null);
        }
    });
};

MongooseAdapter.prototype.destroyAll = function destroyAll(model, cb) {

    this._models[model].find(function (err, data) {
        if (err) return callback(err);
        wait = data.length;
        if (!data.length) return callback(null);
        data.forEach(function (obj) {
            obj.remove(done);
        });
    });

    var error = null;

    function done(err) {
        error = error || err;
        if (--wait === 0) {
            callback(error);
        }
    }
};

MongooseAdapter.prototype.count = function count(model, cb, where) {
    this._models[model].count(where || {}, cb);
};

MongooseAdapter.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
    this.getCached(model, id, function (err, inst) {
        if (err) {
            return cb(err);
        } else if (inst) {
            merge(inst, data);
            inst.save(cb);
        } else cb();
    });
};

// MongooseAdapter.prototype.findAndModify(model, filter, fields, data, {}, cb);

MongooseAdapter.prototype.updateOrCreate = function (model, data, field, cb) {
    if ('function' === typeof field) {
        cb = field;
        field = "id";
    }
    var props = {};
    Object.keys(data).forEach(function (key) {
        if (props[key] || key === field) {
            props[field] = data[key];
        }
    });
    this._models[model].findOne(props, function (err, doc) {
        if (!err) {
            if (!doc) {
                var m = new this._models[model](data);
                m.save(function (err) {
                    cb(err, err ? null : m.id);
                });
            } else {
                doc = merge(doc, data);
                doc.save(function (err) {
                    if (!err) {
                        cb(err);
                    }
                    else {
                        cb(null, doc);
                    }
                });
            }
        } else {
            cb(err);
        }
    });
};

MongooseAdapter.prototype.update = function (model, filter, update, options, callback) {
    if ('function' === typeof options) {
        callback = options;
        options = null;
    } else if ('function' === typeof doc) {
        callback = update;
        update = filter;
        filter = {};
        options = null;
    }
    if (!options) {
        options = {
            multi: true
        };
    }
    if (!filter) {
        filter = {};
    }
    update = {
        $set: update
    };
    this._models[model].update(filter, update, options, callback);
};

MongooseAdapter.prototype.disconnect = function () {
    this.client.connection.close();
};

function merge(base, update) {
    Object.keys(update).forEach(function (key) {
        base[key] = update[key];
    });
    return base;
}