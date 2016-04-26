/**
 * Module dependencies
 */
var utils = require('../utils');
var safeRequire = utils.safeRequire;
var neo4j = safeRequire('node-neo4j');

exports.initialize = function initializeSchema(schema, callback) {
    // 'http://username:password@localhost:7474'
    if (!schema.settings.url) {
        var auth = '';
        var url = schema.settings.host || 'localhost';
        var port = schema.settings.port || 7474;
        url += ':' + port;

        if (schema.settings.username) {
            auth = schema.settings.username;
            if (schema.settings.password) {
                auth += ':' + schema.settings.password;
            }
        }
        if (auth) {
            url = auth + '@' + url;
        }
        /*
         if (schema.settings.database) {
         url += '/' + schema.settings.database;
         } else {
         url += '/';
         }
         */
        url = 'http://' + url;
        schema.settings.url = url;
    }

    var client = new neo4j(schema.settings.url);
    schema.adapter = new Neo4j(schema.settings, client);
    schema.adapter.client = client;
    process.nextTick(callback);
};

function Neo4j(s, client) {
    this.name = 'neo4j';
    this._models = {};
    this.client = client;
    this.cache = {};
    this.settings = s;
}

Neo4j.prototype.define = function defineModel(descr) {
    // this.mixClassMethods(descr.model, descr.properties);
    // this.mixInstanceMethods(descr.model.prototype, descr.properties);
    this._models[descr.model.modelName] = descr;
};

/**
 * Update existing database collections.
 * @param {Function} callback
 */
Neo4j.prototype.autoupdate = function (callback) {
    return callback && callback();
};

Neo4j.prototype.createIndexHelper = function (cls, indexName) {
    var db = this.client;
    var method = 'findBy' + indexName[0].toUpperCase() + indexName.substr(1);
    cls[method] = function (value, cb) {
        db.getIndexedNode(cls.modelName, indexName, value, function (err, node) {
            if (err)
                return cb(err);
            if (node) {
                node.data.id = node.id;
                cb(null, new cls(node.data));
            } else {
                cb(null, null);
            }
        });
    };
};

Neo4j.prototype.mixClassMethods = function mixClassMethods(cls, properties) {
    var neo = this;

    Object.keys(properties).forEach(function (name) {
        if (properties[name].index) {
            neo.createIndexHelper(cls, name);
        }
    });

    cls.setupCypherQuery = function (name, queryStr, rowHandler) {
        cls[name] = function cypherQuery(params, cb) {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            } else if (params.constructor.name !== 'Array') {
                params = [params];
            }

            var i = 0;
            var q = queryStr.replace(/\?/g, function () {
                return params[i++];
            });

            neo.client.query(function (err, result) {
                if (err)
                    return cb(err, []);
                cb(null, result.map(rowHandler));
            }, q);
        };
    };

    /**
     * @param from - id of object to check relation from
     * @param to - id of object to check relation to
     * @param type - type of relation
     * @param direction - all | incoming | outgoing
     * @param cb - callback (err, rel || false)
     */
    cls.relationshipExists = function relationshipExists(from, to, type, direction, cb) {
        neo.node(from, function (err, node) {
            if (err)
                return cb(err);
            node._getRelationships(direction, type, function (err, rels) {
                if (err && cb) {
                    return cb(err);
                }
                if (err && !cb) {
                    throw err;
                }
                var found = false;
                if (rels && rels.forEach) {
                    rels.forEach(function (r) {
                        if (r.start.id === from && r.end.id === to) {
                            found = true;
                        }
                    });
                }
                cb && cb(err, found);
            });
        });
    };

    cls.createRelationshipTo = function createRelationshipTo(id1, id2, type, data, cb) {
        var fromNode, toNode;
        neo.node(id1, function (err, node) {
            if (err && cb)
                return cb(err);
            if (err && !cb)
                throw err;
            fromNode = node;
            ok();
        });
        neo.node(id2, function (err, node) {
            if (err && cb)
                return cb(err);
            if (err && !cb)
                throw err;
            toNode = node;
            ok();
        });
        function ok() {
            if (fromNode && toNode) {
                fromNode.createRelationshipTo(toNode, type, cleanup(data), cb);
            }
        }
    };

    cls.createRelationshipFrom = function createRelationshipFrom(id1, id2, type, data, cb) {
        cls.createRelationshipTo(id2, id1, type, data, cb);
    };

    // only create relationship if it is not exists
    cls.ensureRelationshipTo = function (id1, id2, type, data, cb) {
        cls.relationshipExists(id1, id2, type, 'outgoing', function (err, exists) {
            if (err && cb)
                return cb(err);
            if (err && !cb)
                throw err;
            if (exists)
                return cb && cb(null);
            cls.createRelationshipTo(id1, id2, type, data, cb);
        });
    };
};

Neo4j.prototype.mixInstanceMethods = function mixInstanceMethods(proto) {
    var neo = this;
    /**
     * @param obj - Object or id of object to check relation with
     * @param type - type of relation
     * @param cb - callback (err, rel || false)
     * @param {mixed} direction
     */
    proto.isInRelationWith = function isInRelationWith(obj, type, direction, cb) {
        this.constructor.relationshipExists(this.id, obj.id || obj, type, 'all', cb);
    };
};

Neo4j.prototype.findById = function findById(model, id, callback) {
    var self = this;
    self.client.readNode(id, function (err, node) {
        if (!node) {
            return callback && callback(err, null);
        }
        var id = node._id;
        delete node._id;
        node = self.fromDatabase(model, node);
        node.id = id;
        return callback && callback(err, node);
    }.bind(self));
};

Neo4j.prototype.create = function create(model, data, callback) {
    var cdata = {};
    cdata.nodeType = model;
    var self = this, props = self._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (!props[key]) return;
        cdata[key] = self.toDatabase(props[key], data[key]);
    });

    self.client.insertNode(cdata, model, function (err, node) {
        if (err) {
            return callback(err);
        }
        callback(err, node._id);
    });
};

Neo4j.prototype.updateIndexes = function updateIndexes(model, node, callback) {
    var props = this._models[model].properties;
    var wait = 1;
    Object.keys(props).forEach(function (key) {
        if (props[key].index && node.data[key]) {
            wait += 1;
            node.index(model, key, node.data[key], done);
        }
    });

    done();

    var error = false;

    function done(err) {
        error = error || err;
        if (--wait === 0) {
            callback(error);
        }
    }
};

Neo4j.prototype.save = function save(model, data, callback) {
    var self = this, id = data.id;
    self.updateAttributes(model, id, data, function (err, updatedNode) {
        return callback && callback(err, updatedNode);
    }.bind(self));
};

Neo4j.prototype.exists = function exists(model, id, callback) {
    this.findById(model, id, function (err, data) {
        return callback(err, !err && data)
    }.bind(this));
};

Neo4j.prototype.destroy = function destroy(model, id, callback) {
    this.client.deleteNode(id, function (err, node) {
        callback(err, node);
    });
};

Neo4j.prototype.all = function all(model, filter, callback) {
    if ('function' === typeof filter) {
        callback = filter;
        filter = {};
    }
    if (!filter) {
        filter = {};
    }
    var self = this, query = ['MATCH (data:' + model + ')'];

    query.push('WHERE data.nodeType = \'' + model + '\'');

    if (filter) {
        if (filter.where) {
            var sql = self.buildWhere(filter.where, self, model);
            query.push(sql);
        }
    }
    query.push('RETURN data');

    if (filter.order) {
        var order = 'data.' + filter.order;
        if (typeof order === 'string') {
            order = [order];
        }
        query.push('ORDER BY ', order.join(', '));
    }

    if (filter.limit) {
        if (filter.skip) {
            query.push('SKIP ' + (filter.skip || 0));
        }
        query.push('LIMIT ' + filter.limit);
    }

    self.client.cypherQuery(query.join(' '), function (err, res) {
        var data = (res || {}).data || [];
        data = data.map(function (obj) {
            var cleared = self.fromDatabase(model, obj);
            cleared.id = obj._id;
            return cleared;
        });
        return callback && callback(err, data);
    }.bind(self));
};

Neo4j.prototype.destroyAll = function destroyAll(model, callback) {
    var query = 'MATCH (data:' + model + ') ' +
        'WHERE data.nodeType = \'' + model + '\' ' +
        'DELETE data RETURN count(data)';
    this.client.cypherQuery(query, function (err, res) {
        callback(err, res);
    }.bind(this));
};

Neo4j.prototype.count = function count(model, callback, filter) {
    var self = this, query = ['MATCH (data:' + model + ')'];
    query.push('WHERE data.nodeType = \'' + model + '\'');
    if (filter) {
        if (filter.where) {
            var sql = self.buildWhere(filter.where, self, model);
            query.push(sql);
        }
    }
    query.push('RETURN  count(data) AS count');
    self.client.cypherQuery(query.join(' '), function (err, res) {
        var count = 0;
        if (res && res.data) {
            count = res.data[0] || 0;
        }
        return callback && callback(err, count);
    }.bind(self));
};

Neo4j.prototype.updateAttributes = function updateAttributes(model, id, data, callback) {
    var self = this, props = self._models[model].properties;
    self.findById(model, id, function (err, node) {
        Object.keys(data).forEach(function (key) {
            data[key] = self.toDatabase(props[key], data[key]);
        });
        var merged = merge(node, data);
        merged.id = id;
        merged.nodeType = model;
        self.client.updateNode(id, merged, function (err, updated) {
            return callback && callback(err, updated);
        });
    }.bind(self));
};

/**
 * Update rows
 * @param {String} model
 * @param {Object} filter
 * @param {Object} data
 * @param {Function} callback
 */
Neo4j.prototype.update = function (model, filter, data, callback) {
    if ('function' === typeof filter) {
        return filter(new Error("Get parametrs undefined"), null);
    }
    if ('function' === typeof data) {
        return data(new Error("Set parametrs undefined"), null);
    }
    var self = this, cdata = {}, props = self._models[model].properties;
    filter = filter.where ? filter.where : filter;
    Object.keys(data).forEach(function (key) {
        cdata[key] = self.toDatabase(props[key], data[key]);
    });
    self.client.updateNodesWithLabelsAndProperties(model, filter, cdata, [], false, function (err, updatedNodes) {
        return callback && callback(err, updatedNodes);
    });
};

Neo4j.prototype.toDatabase = function (prop, val, esc) {
    "use strict";
    if (val === null) {
        return '';
    }
    if (!prop) {
        return val;
    }
    var type = (prop.type.name || '').toString().toLowerCase();
    if (type === 'number') {
        return val;
    }
    if (type === 'date') {
        if (!val) {
            return 0;
        }
        if (typeof val === 'string') {
            val = Date.parse(val);
        }
        if (val instanceof Date) {
            val = val.getTime();
        }
        return val;
    }
    if (type === "boolean") {
        return val ? 1 : 0;
    }
    if (type === "json") {
        if (typeof val === 'object') {
            val = JSON.stringify(val);
        }
    }
    return esc ? '\'' + val.toString() + '\'' : val.toString();
};

Neo4j.prototype.fromDatabase = function (model, data) {
    if (!data) {
        return null;
    }
    var clean = {};
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key];
        if (!props[key]) {
            return;
        }
        var type = (props[key].type.name || '').toString().toLowerCase();

        if (type === 'date' && val !== null) {
            if (val !== '') {
                clean[key] = new Date(val);
            } else {
                clean[key] = '';
            }
        } else if (type === 'json') {
            if (typeof val === 'string') {
                try {
                    clean[key] = JSON.parse(val);
                } catch (err) {
                    clean[key] = val;
                }
            } else {
                clean[key] = val;
            }
        } else {
            clean[key] = val;
        }

    });
    return clean;
};

Neo4j.prototype.buildWhere = function buildWhere(conds, adapter, model) {
    'use strict';
    var cs = [], or = [],
        self = adapter,
        props = self._models[model].properties;

    Object.keys(conds).forEach(function (key) {
        if (key !== 'or') {
            cs = parseCond(cs, key, props, conds, self);
        } else {
            conds[key].forEach(function (oconds) {
                Object.keys(oconds).forEach(function (okey) {
                    or = parseCond(or, okey, props, oconds, self);
                });
            });
        }
    });

    if (cs.length === 0 && or.length === 0) {
        return '';
    }
    var orop = "";
    if (or.length) {
        orop = ' (' + or.join(' OR ') + ') ';
    }
    orop += (orop !== "" && cs.length > 0) ? ' AND ' : '';
    return 'AND ' + orop + cs.join(' AND ');
};

var parseCond = function (cs, key, props, conds, self) {
    'use strict';
    var keyEscaped = 'data.' + key;
    var val = conds[key];
    if (val === null) {
        cs.push(keyEscaped + '\'\'');
    } else if (val.constructor.name === 'Object') {
        Object.keys(val).forEach(function (condType) {
            val = self.toDatabase(props[key], val[condType], true);
            var sqlCond = keyEscaped;
            if ((condType === 'inq' || condType === 'nin') && val.length === 0) {
                cs.push(condType === 'inq' ? 0 : 1);
                return true;
            }
            switch (condType.toString().toLowerCase()) {
                case 'gt':
                    sqlCond += ' > ';
                    break;
                case 'gte':
                    sqlCond += ' >= ';
                    break;
                case 'lt':
                    sqlCond += ' < ';
                    break;
                case 'lte':
                    sqlCond += ' <= ';
                    break;
                case 'between':
                    sqlCond += '';
                    break;
                case 'inq':
                case 'in':
                    sqlCond += ' IN ';
                    break;
                case 'nin':
                    sqlCond = ' NOT ( ' + keyEscaped + ' IN [' + val + '])';
                    break;
                case 'neq':
                case 'ne':
                    sqlCond = ' NOT ( ' + keyEscaped + ' = ' + val + ' )';
                    break;
                case 'regex':
                    sqlCond += ' REGEXP ';
                    break;
                case 'like':
                    sqlCond += ' LIKE ';
                    break;
                case 'nlike':
                    sqlCond += ' NOT LIKE ';
                    break;
                default:
                    sqlCond += ' ' + condType + ' ';
                    break;
            }

            if (condType === 'between') {
                sqlCond = val[0] + ' <= ' + keyEscaped + ' <= ' + val[1];
            } else if (condType === 'in' || condType === 'inq') {
                sqlCond += '[' + val + ']';
            } else if (condType === 'neq' || condType === 'ne' || condType === 'nin') {

            } else {
                sqlCond += val;
            }
            cs.push(sqlCond);
        });

    } else if (/^\//gi.test(conds[key])) {
        var reg = val.toString().split('/');
        cs.push(keyEscaped + ' REGEXP "' + reg[1] + '"');
    } else {
        val = self.toDatabase(props[key], val, true);
        cs.push(keyEscaped + ' = ' + val);
    }
    return cs;
};

var cleanup = function (data) {
    if (!data) {
        return null;
    }
    var res = {};
    Object.keys(data).forEach(function (key) {
        var v = data[key];
        if (v === null) {
            // skip
            // console.log('skip null', key);
        } else if (v && v.constructor.name === 'Array' && v.length === 0) {
            // skip
            // console.log('skip blank array', key);
        } else if (typeof v !== 'undefined') {
            res[key] = v;
        }
    });
    return res;
};

var merge = function (base, update) {
    Object.keys(update).forEach(function (key) {
        base[key] = update[key];
    });
    return base;
};
