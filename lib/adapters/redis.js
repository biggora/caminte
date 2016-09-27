/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var redis = safeRequire('redis');
var utils = require('../utils');
var helpers = utils.helpers;

exports.initialize = function initializeSchema(schema, callback) {
    if (!redis) {
        return;
    }
    if (schema.settings.socket) {
        schema.client = redis.createClient(
            schema.settings.socket,
            schema.settings.options
        );
    } else if (schema.settings.url) {
        var url = require('url');
        var redisUrl = url.parse(schema.settings.url);
        var redisAuth = (redisUrl.auth || '').split(':');
        schema.settings.host = redisUrl.hostname;
        schema.settings.port = redisUrl.port;
        if (redisAuth.length === 2) {
            schema.settings.db = redisAuth[0];
            schema.settings.password = redisAuth[1];
        }
    }

    if (!schema.client) {
        schema.client = redis.createClient(
            schema.settings.port,
            schema.settings.host,
            schema.settings.options
        );

        if (schema.settings.password) {
            schema.client.auth(schema.settings.password);
        }
    }

    var callbackCalled = false;
    var database = schema.settings.hasOwnProperty('database') && schema.settings.database;
    schema.client.on('connect', function () {
        if (!callbackCalled && database === false) {
            callbackCalled = true;
            callback();
        } else if (database !== false) {
            if (callbackCalled) {
                return schema.client.select(schema.settings.database);
            } else {
                callbackCalled = true;
                return schema.client.select(schema.settings.database, callback);
            }
        }
    });

    var clientWrapper = new Client(schema.client);
    schema.adapter = new BridgeToRedis(schema.settings, clientWrapper);
    clientWrapper._adapter = schema.adapter;
};

function Client(client) {
    this._client = client;
}

var commands = Object.keys(redis.Multi.prototype).filter(function (n) {
    return n.match(/^[a-z]/);
});

commands.forEach(function (cmd) {

    Client.prototype[cmd] = function (args, callback) {
        var c = this._client, log;
        if (typeof args === 'string') {
            args = [args];
        }
        if (!args) {
            args = [];
        }
        var lstr = cmd.toUpperCase() + ' ' + args.map(function (a) {
                if (typeof a === 'object') {
                    return JSON.stringify(a);
                }
                return a;
            }).join(' ');

        args.push(function (err, replies) {
            if (err) {
                console.log(err);
            }
            callback && callback(err, replies);
        });
        c[cmd].apply(c, args);
    };
});

Client.prototype.multi = function (commands, callback) {
    if (commands.length === 0)
        return callback && callback();
    if (commands.length === 1) {
        return this[commands[0].shift().toLowerCase()].call(
            this,
            commands[0],
            callback && function (e, r) {
                callback(e, [r]);
            });
    }
    var lstr = 'MULTI\n  ' + commands.map(function (x) {
            return x.join(' ');
        }).join('\n  ') + '\nEXEC';

    this._client.multi(commands).exec(function (err, replies) {
        if (err) {
            console.log(err);
        }
        callback && callback(err, replies);
    });
};

Client.prototype.transaction = function () {
    return new Transaction(this);
};

function Transaction(client) {
    this._client = client;
    this._handlers = [];
    this._schedule = [];
}

Transaction.prototype.run = function (cb) {
    var t = this;
    var atLeastOneHandler = false;
    switch (this._schedule.length) {
        case 0:
            return cb();
        case 1:
            return this._client[this._schedule[0].shift()].call(
                this._client,
                this._schedule[0],
                this._handlers[0] || cb);
        default:
            this._client.multi(this._schedule, function (err, replies) {
                if (err)
                    return cb(err);
                replies.forEach(function (r, i) {
                    if (t._handlers[i]) {
                        atLeastOneHandler = true;
                        t._handlers[i](err, r);
                    }
                });
                if (!atLeastOneHandler)
                    cb(err);
            });
    }

};

commands.forEach(function (k) {
    Transaction.prototype[k] = function (args, cb) {
        if (typeof args === 'string') {
            args = [args];
        }
        args.unshift(k);
        this._schedule.push(args);
        this._handlers.push(cb || false);
    };
});

function BridgeToRedis(s, client) {
    this.name = 'redis';
    this._models = {};
    this.client = client;
    this.indexes = {};
    this.settings = s;
}

BridgeToRedis.prototype.define = function (descr) {
    var self = this;
    var m = descr.model.modelName;
    self._models[m] = descr;
    self.indexes[m] = {
        id: Number
    };
    Object.keys(descr.properties).forEach(function (prop) {
        if (descr.properties[prop].index) {
            self.indexes[m][prop] = descr.properties[prop].type;
        } else if (prop === 'id') {
            self.indexes[m][prop] = descr.properties[prop].type;
        }
    }.bind(this));
};

BridgeToRedis.prototype.defineForeignKey = function (model, key, cb) {
    this.indexes[model][key] = Number;
    cb(null, Number);
};

BridgeToRedis.prototype.forDatabase = function (model, data) {
    var p = this._models[model].properties;
    for (var i in data) {
        if (!p[i]) {
            continue;
        }
        if (typeof data[i] === 'undefined' || data[i] === null) {
            if (p[i].default || p[i].default === 0) {
                if (typeof p[i].default === 'function') {
                    data[i] = p[i].default();
                } else {
                    data[i] = p[i].default;
                }
            } else {
                data[i] = "";
                continue;
            }
        }

        switch ((p[i].type.name || '').toString().toLowerCase()) {
            case "date":
                if (data[i].getTime) {
                    data[i] = data[i].getTime().toString();
                } else if (parseInt(data[i]) > 0) {
                    data[i] = data[i].toString();
                } else {
                    data[i] = '0';
                }
                break;
            case "number":
                data[i] = data[i].toString();
                break;
            case "boolean":
                data[i] = !!data[i] ? "1" : "0";
                break;
            case "json":
                if (typeof data[i] === 'object') {
                    data[i] = JSON.stringify(data[i]);
                }
                break;
            default:
                data[i] = data[i].toString();
        }

    }
    return data;
};

BridgeToRedis.prototype.fromDatabase = function (model, data) {
    var p = this._models[model].properties, d;
    for (var i in data) {
        if (!p[i]) {
            continue;
        }
        var type = (p[i].type.name || '').toString().toLowerCase();
        if (typeof data[i] === 'undefined' || data[i] === null) {
            if (p[i].default || p[i].default === 0) {
                if (typeof p[i].default === 'function') {
                    data[i] = p[i].default();
                } else {
                    data[i] = p[i].default;
                }
            } else {
                data[i] = "";
                continue;
            }
        }

        switch (type) {
            case "json":
                try {
                    if (typeof data[i] === 'string') {
                        data[i] = JSON.parse(data[i]);
                    }
                } catch (err) {
                }
                break;
            case "date":
                d = new Date(data[i]);
                d.setTime(data[i]);
                data[i] = d;
                break;
            case "number":
                data[i] = Number(data[i]);
                break;
            case "boolean":
                data[i] = data[i] === "1";
                break;

        }
    }
    return data;
};

BridgeToRedis.prototype.save = function (model, data, callback) {
    var self = this;
    data = self.forDatabase(model, data);
    deleteNulls(data);
    self.client.hgetall(model + ':' + data.id, function (err, prevData) {
        if (err) {
            return callback(err);
        }
        self.client.hmset([model + ':' + data.id, self.forDatabase(model, data)], function (err) {
            if (err) {
                return callback(err);
            }
            if (prevData) {
                Object.keys(prevData).forEach(function (k) {
                    if (data.hasOwnProperty(k)) {
                        return;
                    }
                    data[k] = prevData[k];
                });
            }
            self.updateIndexes(model, data.id, data, callback, self.forDatabase(model, prevData));
        }.bind(this));
    }.bind(this));
};

BridgeToRedis.prototype.updateIndexes = function (model, id, data, callback, prevData) {
    var p = this._models[model].properties;
    var i = this.indexes[model];
    var schedule = [];
    if (!callback.removed) {
        schedule.push(['SADD', 's:' + model, id]);
    }
    Object.keys(i).forEach(function (key) {
        if (data.hasOwnProperty(key)) {
            var val = data[key];
            schedule.push([
                'SADD',
                'i:' + model + ':' + key + ':' + val,
                id
            ]);
        }
        if (prevData && prevData[key] !== data[key]) {
            schedule.push([
                'SREM',
                'i:' + model + ':' + key + ':' + prevData[key],
                id
            ]);
        }
    });

    if (schedule.length) {
        this.client.multi(schedule, function (err) {
            callback(err, data);
        });
    } else {
        callback(null);
    }
};

BridgeToRedis.prototype.create = function (model, data, callback) {
    if (data.id) {
        return create.call(this, data.id, true);
    }
    this.client.incr('id:' + model, function (err, id) {
        create.call(this, id);
    }.bind(this));

    function create(id, upsert) {
        data.id = id.toString();
        this.save(model, data, function (err) {
            if (callback) {
                callback(err, parseInt(id, 10));
            }
        });
        // push the id to the list of user ids for sorting
        this.client.sadd(['s:' + model, data.id]);
    }
};

BridgeToRedis.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    if (!filter.where) {
        filter = {where: filter};
    }
    var self = this;

    self.all(model, filter, function (err, found) {
        if (!found || !found.length) {
            return callback && callback(err);
        }
        var dlen = found.length;
        found.forEach(function (doc) {
            doc = helpers.merge(doc, data);
            self.save(model, doc, function (error) {
                if (--dlen === 0) {
                    return callback && callback(error, 0);
                }
            });
        });
    });
};

BridgeToRedis.prototype.exists = function (model, id, callback) {
    this.client.exists(model + ':' + id, function (err, exists) {
        if (callback) {
            callback(err, exists ? true : false);
        }
    });
};

BridgeToRedis.prototype.findById = function findById(model, id, callback) {
    var self = this;
    self.client.hgetall(model + ':' + id, function (err, data) {
        if (data && Object.keys(data).length > 0) {
            data.id = id;
        } else {
            data = null;
        }
        data = self.fromDatabase(model, data);
        callback(err, data);
    }.bind(this));
};

BridgeToRedis.prototype.destroy = function destroy(model, id, callback) {
    var br = this;
    var trans = br.client.transaction();
    br.client.hgetall(model + ':' + id, function (err, data) {
        if (err) {
            return callback(err);
        }
        trans.srem(['s:' + model, id]);
        trans.del(model + ':' + id);
        trans.run(function (err) {
            if (err) {
                return callback(err);
            }
            callback.removed = true;
            br.updateIndexes(model, id, {}, callback, data);
        });
    });
};

BridgeToRedis.prototype.possibleIndexes = function (model, filter, callback) {

    if (!filter || Object.keys(filter.where || {}).length === 0) {
        // no index needed
        callback([[], [], [], true]);
        return false;
        /*
         filter.where = {
         id: {
         gt: 0
         }
         };
         */
    }

    var self = this;
    var dest = 'where:' + (Date.now() * Math.random());
    var props = self._models[model].properties;
    var compIndex = {};
    var foundIndex = [];
    var noIndex = [];

    Object.keys(filter.where).forEach(function (key) {
        var i = self.indexes[model][key];

        if (i && typeof i !== 'undefined') {
            var val = filter.where[key];
            if (val && typeof val === 'object' && !val.getTime) {
                var cin = 'i:' + model + ':' + key + ':';
                if (!compIndex[key]) {
                    compIndex[key] = {
                        conds: []
                    };
                }
                if (i.name === 'Date') {
                    Object.keys(val).forEach(function (cndkey) {
                        val[cndkey] = val[cndkey] && val[cndkey].getTime ? val[cndkey].getTime() : 0;
                    });
                }
                compIndex[key].rkey = cin + '*';
                compIndex[key].fkey = cin;
                compIndex[key].type = props[key].type.name;
                compIndex[key].conds.push(val);
            } else {
                if (i.name === 'Date') {
                    val = val && val.getTime ? val.getTime() : 0;
                }
                foundIndex.push('i:' + model + ':' + key + ':' + val);
            }
        } else {
            noIndex.push(key);
        }
    }.bind(this));

    if (Object.keys(compIndex || {}).length > 0) {
        var multi = self.client._client.multi();
        for (var ik in compIndex) {
            multi.keys(compIndex[ik].rkey);
        }
        multi.exec(function (err, mkeys) {
            if (err) {
                console.log(err);
            }
            var condIndex = [];
            for (var ic in compIndex) {
                var kregex = new RegExp('^' + compIndex[ic].fkey + '(.*)');
                if (mkeys) {
                    for (var i in mkeys) {
                        var keys = mkeys[i];
                        if (keys.length) {
                            keys.forEach(function (key) {
                                if (kregex.test(key)) {
                                    var fkval = RegExp.$1;
                                    if (compIndex[ic].type === 'Number' || compIndex[ic].type === 'Date') {
                                        fkval = parseInt(fkval);
                                    }
                                    if (helpers.parseCond(fkval, compIndex[ic].conds[0])) {
                                        condIndex.push(key);
                                    }
                                }
                            }.bind(this));
                        }
                    }
                }
            }
            condIndex.unshift(dest);
            self.client._client.sunionstore(condIndex, function (err, replies) {
                if (replies > 0) {
                    foundIndex.push(dest);
                }
                callback([foundIndex, noIndex, [dest]]);
            });
        }.bind(this));
    } else {
        callback([foundIndex, noIndex, [dest]]);
    }
};

BridgeToRedis.prototype.all = BridgeToRedis.prototype.find = function all(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }

    var self = this;
    var dest = 'temp:' + (Date.now() * Math.random());

    if (!filter) {
        filter = {order: 'id'};
    }

    // WHERE
    if (!filter.where || Object.keys(filter.where).length === 0) {
        dest = 's:' + model;
        // no filtering, just sort/limit (if any)
        // but we need where to be an object for possibleIndexes
        filter.where = {};
    }

    self.possibleIndexes(model, filter, function (pi) {
        var client = self.client;
        var cmd;
        var sortCmd = [];
        var props = self._models[model].properties;
        var allNumeric = true;
        var trans = self.client.transaction();
        var indexes = pi[0];
        var noIndexes = pi[1];

        if (noIndexes.length) {
            throw new Error(model + ': no indexes found for ' +
                noIndexes.join(', ') +
                ' impossible to sort and filter using redis adapter');
        }

        // indexes needed
        if (pi.length < 4) {
            if (indexes && indexes.length > 0) {
                indexes.unshift(dest);
                trans.sinterstore(indexes);
            } else {
                return callback && callback(null, []);
            }
        }
        // only counting?
        if (filter.getCount) {
            trans.scard(dest, callback);
            return trans.run();
        }

        // ORDER
        var reverse = false;
        if (!filter.order) {
            filter.order = 'id';
        }
        var orders = filter.order;
        if (typeof filter.order === "string") {
            orders = [filter.order];
        }

        orders.forEach(function (key) {
            var m = key.match(/\s+(A|DE)SC$/i);
            if (m) {
                key = key.replace(/\s+(A|DE)SC/i, '');
                if (m[1] === 'DE')
                    reverse = true;
            }
            if (props[key].type.name !== 'Number' && props[key].type.name !== 'Date') {
                allNumeric = false;
            }
            sortCmd.push("BY", model + ":*->" + key);
        });

        // LIMIT
        if (filter.limit) {
            var offset = (filter.offset || filter.skip || 0), limit = filter.limit;
            sortCmd.push("LIMIT", offset, limit);
        }

        // we need ALPHA modifier when sorting string values
        // the only case it's not required - we sort numbers
        if (!allNumeric) {
            sortCmd.push('ALPHA');
        }

        if (reverse) {
            sortCmd.push('DESC');
        }

        sortCmd.unshift(dest);
        sortCmd.push("GET", "#");
        cmd = "SORT " + sortCmd.join(" ");

        trans.sort(sortCmd, function (err, ids) {
            if (err) {
                return callback(err, []);
            }
            var sortedKeys = ids.map(function (i) {
                return model + ":" + i;
            });
            handleKeys(err, sortedKeys);
        }.bind(this));

        if (dest.match(/^temp/)) {
            trans.del(dest);
        }

        if (indexes && indexes.length > 0) {
            indexes.forEach(function (idx) {
                if (idx.match(/^where/)) {
                    trans.del(idx);
                }
            }.bind(this));
        }

        function handleKeys(err, keys) {
            if (err) {
                console.log(err);
            }
            var query = keys.map(function (key) {
                return ['hgetall', key];
            });
            client.multi(query, function (err, replies) {
                callback(err, (replies || []).map(function (r) {
                    return self.fromDatabase(model, r);
                }));
            }.bind(this));
        }

        function numerically(a, b) {
            return a[this[0]] - b[this[0]];
        }

        function literally(a, b) {
            return a[this[0]] > b[this[0]];
        }

        return trans.run(function(err, data){
            return callback && callback(err, data);
        });
    });
};

BridgeToRedis.prototype.remove = function remove(model, filter, callback) {
    var self = this;
    var dest = 'temp:' + (Date.now() * Math.random());
    self.possibleIndexes(model, filter, function (pi) {
        var indexes = pi[0];
        var noIndexes = pi[1];
        var trans = self.client._client.multi();

        if (noIndexes.length) {
            throw new Error(model + ': no indexes found for ' +
                noIndexes.join(', ') +
                ' impossible to sort and filter using redis adapter');
        }

        if (indexes && indexes.length > 0) {
            if (indexes.length === 1) {
                indexes.unshift(dest);
                trans.sunionstore(indexes);
                trans.smembers(dest);
            } else {
                indexes.unshift(dest);
                trans.sinterstore(indexes);
            }
        } else {
            callback(null, null);
        }

        if (dest.match(/^temp/)) {
            trans.del(dest);
        }
        if (indexes && indexes.length > 0) {
            indexes.forEach(function (idx) {
                if (idx.match(/^where/)) {
                    trans.del(idx);
                }
            }.bind(this));
        }

        trans.exec(function (err, result) {
            if (err) {
                console.log(err);
            }
            var found = result[1] || [];
            var query = found.map(function (key) {
                return ['hgetall', (model + ':' + key)];
            });

            if (found && found.length > 0) {
                self.client.multi(query, function (err, replies) {
                    var schedule = [];
                    if (replies && replies.length > 0) {
                        replies.forEach(function (reply) {
                            if (reply) {
                                schedule.push([
                                    'DEL',
                                    model + ':' + reply.id
                                ]);
                                schedule.push([
                                    'SREM',
                                    's:' + model,
                                    reply.id
                                ]);
                                Object.keys(reply).forEach(function (replyKey) {
                                    schedule.push([
                                        'SREM',
                                        'i:' + model + ':' + replyKey + ':' + reply[replyKey],
                                        reply.id
                                    ]);
                                }.bind(this));
                            }
                        }.bind(this));
                        self.client.multi(schedule, callback);
                    } else {
                        callback(null);
                    }
                }.bind(this));
            } else {
                callback(null);
            }
        });
    });
};

BridgeToRedis.prototype.destroyAll = function destroyAll(model, callback) {
    var br = this;
    br.client.multi([
        ['KEYS', model + ':*'],
        ['KEYS', '*:' + model + ':*']
    ], function (err, k) {
        br.client.del(k[0].concat(k[1]).concat('s:' + model), callback);
    });
};

BridgeToRedis.prototype.count = function count(model, callback, where) {
    if (where && Object.keys(where).length) {
        this.all(model, {where: where, getCount: true}, callback);
    } else {
        this.client.scard('s:' + model, callback);
    }
};

BridgeToRedis.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
    var self = this;
    data.id = id;
    self.findById(model, id, function (err, prevData) {
        self.save(model, data, callback, prevData);
    });
};

function deleteNulls(data) {
    Object.keys(data).forEach(function (key) {
        if (data[key] === null)
            delete data[key];
    });
}

BridgeToRedis.prototype.disconnect = function disconnect() {
    this.client.quit();
};
