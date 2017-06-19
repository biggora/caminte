/**
 * Module dependencies
 */
var Bluebird = require('bluebird');
var vld = require('./validatable');
var hkb = require('./hookable');
var util = require('util');
var utils = require('./utils');
var helpers = utils.helpers;
var Query = require('./query');
var Validatable = vld.Validatable;
var List = require('./list');
var Hookable = hkb.Hookable;
var BASE_TYPES = ['String', 'Boolean', 'Number', 'Date', 'Text', 'JSON', 'UUID'];

/**
 * Defer Promise
 * @returns {{resolve: *, reject: *, promise}}
 */
function deferPromise() {
    var resolve = null, reject = null;
    var promise = new Bluebird(function () {
        resolve = arguments[0];
        reject = arguments[1];
    });
    return {
        resolve: resolve,
        reject: reject,
        promise: promise
    };
}

exports.AbstractClass = AbstractClass;

if (!Object.prototype.hasOwnProperty('extend')) {
    Object.defineProperty(Object.prototype, 'extend', {
        enumerable: false,
        writable: true,
        value: function (from) {
            var props = Object.getOwnPropertyNames(from);
            var dest = this;
            props.forEach(function (name) {
                if (name in dest) {
                    var destination = Object.getOwnPropertyDescriptor(from, name);
                    Object.defineProperty(dest, name, destination);
                }
            });
            return this;
        }
    });
}

AbstractClass.__proto__ = Validatable;
AbstractClass.prototype.__proto__ = Validatable.prototype;
utils.inherits(AbstractClass, Hookable);

/**
 * Abstract class - base class for all persist objects
 * provides **common API** to access any database adapter.
 * This class describes only abstract behavior layer, refer to `lib/adapters/*.js`
 * to learn more about specific adapter implementations
 *
 * `AbstractClass` mixes `Validatable` and `Hookable` classes methods
 *
 * @constructor
 * @param {Object} data - initial object data
 */
function AbstractClass(data) {
    this._initProperties(data, true);
}

AbstractClass.prototype._initProperties = function (data, applySetters) {
    var self = this;
    var ctor = this.constructor;
    var ds = ctor.schema.definitions[ctor.modelName];
    var properties = ds.properties;
    data = data || {};

    Object.defineProperty(this, '__cachedRelations', {
        writable: true,
        enumerable: false,
        configurable: true,
        value: {}
    });

    Object.defineProperty(this, '__data', {
        writable: true,
        enumerable: false,
        configurable: true,
        value: {}
    });

    Object.defineProperty(this, '__query', {
        writable: true,
        enumerable: false,
        configurable: true,
        value: {}
    });

    Object.defineProperty(this, '__dataWas', {
        writable: true,
        enumerable: false,
        configurable: true,
        value: {}
    });

    if (data['__cachedRelations']) {
        this.__cachedRelations = data['__cachedRelations'];
    }

    for (var i in data) {
        this.__data[i] = this.__dataWas[i] = data[i];
    }
    if (applySetters && ctor.setter) {
        Object.keys(ctor.setter).forEach(function (attr) {
            if (self.__data.hasOwnProperty(attr)) {
                ctor.setter[attr].call(self, self.__data[attr]);
            }
        });
    }

    ctor.forEachProperty(function (attr) {
        if (!self.__data.hasOwnProperty(attr)) {
            self.__data[attr] = self.__dataWas[attr] = getDefault(attr);
        } else {
            self.__dataWas[attr] = self.__data[attr];
        }
    });

    ctor.forEachProperty(function (attr) {
        if (properties[attr].type === undefined) {
            properties[attr].type = String;
        }
        var type = properties[attr].type;
        if (BASE_TYPES.indexOf(type.name) === -1) {
            if (typeof self.__data[attr] !== 'object' && self.__data[attr]) {
                try {
                    self.__data[attr] = JSON.parse(self.__data[attr] + '');
                } catch (e) {
                    console.log(type.name, attr, self.__data[attr], e);
                }
            }
            if (type.name === 'Array' || typeof type === 'object' && type.constructor.name === 'Array') {
                self.__data[attr] = new List(self.__data[attr], type, self);
            }
        }
    });

    function getDefault(attr) {
        var def = properties[attr]['default'];
        if (isdef(def)) {
            if (typeof def === 'function') {
                return def();
            } else {
                return def;
            }
        } else {
            return null;
        }
    }

    this.trigger('initialize');
};

/**
 * @param {String} prop - property name
 * @param {Object} params - various property configuration
 */
AbstractClass.defineProperty = function (prop, params) {
    this.schema.defineProperty(this.modelName, prop, params);
};

AbstractClass.whatTypeName = function (propName) {
    var ds = this.schema.definitions[this.modelName];
    return ds.properties[propName] && ds.properties[propName].type.name;
};

AbstractClass.clone = function clone(o) {
    var ret = {};
    Object.keys(o).forEach(function (val) {
        ret[val] = o[val];
    });
    return ret;
};

AbstractClass._forDB = function (data) {
    var res = {}, YesSQL = ['mysql', 'sqlite', 'sqlite3', 'firebird', 'memory'];
    Object.keys(data).forEach(function (propName) {
        if ((this.whatTypeName(propName) || '').toString().toLowerCase() === 'json'
            || data[propName] instanceof Array) {
            if (YesSQL.indexOf(this.schema.adapter.name || this.schema.name) !== -1) {
                res[propName] = JSON.stringify(data[propName]);
            } else {
                res[propName] = data[propName];
            }
        } else {
            res[propName] = data[propName];
        }
    }.bind(this));
    return res;
};

AbstractClass.q = {
    conditions: {},
    params: {},
    pkey: false,
    fields: false
};

AbstractClass.prototype.whatTypeName = function (propName) {
    return this.constructor.whatTypeName(propName);
};

AbstractClass.query = function (data, callback) {
    if (typeof this.schema.adapter.query === 'undefined') {
        callback(new Error('Model::query not defined for this adapter'));
    } else {
        var p = deferPromise();
        this.schema.adapter.query(data, function (err, data) {
            if (err) {
                if(!callback) p.reject(err);
            } else {
                if(!callback) p.resolve(data);
            }
            return callback && callback(err, data);
        });
        return p.promise;
    }
};
/**
 * Create new instance of Model class, saved in database
 *
 * @param data [optional]
 * @param {Function} callback - callback called with (err, obj)
 * callback called with arguments:
 *
 *   - err (null or Error)
 *   - instance (null or Model)
 */
AbstractClass.create = function (data, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    var modelName = this.modelName;
    var p = deferPromise();

    if (typeof data === 'function') {
        callback = data;
        data = {};
    }

    if (typeof callback !== 'function') {
        callback = function () {
        };
    }

    var obj = null;
    // if we come from save
    if (data instanceof this && !data.id) {
        obj = data;
        data = obj.toObject(true);
        obj._initProperties(data, false);
        create();
    } else {
        obj = new this(data);
        // validation required
        obj.isValid(function (valid) {
            if (!valid) {
                if(!callback) p.reject(new Error('Validation error'));
                return callback && callback(new Error('Validation error'), obj);
            } else {
                create();
            }
        });
    }

    function create() {
        obj.trigger('create', function (done) {
            var data = this.toObject(true);  // Added this to fix the beforeCreate trigger not fire.
            // The fix is per issue #72 and the fix was found by by5739.
            this._adapter().create(modelName, this.constructor._forDB(data), function (err, id, rev) {
                if (id) {
                    obj.__data.id = id;
                    obj.__dataWas.id = id;
                    defineReadonlyProp(obj, 'id', id);
                }
                if (rev) {
                    obj._rev = rev;
                }
                done.call(this, function () {
                    if (err) {
                        p.reject(err);
                    } else {
                        p.resolve(obj);
                    }
                    return callback && callback(err, obj);
                });
            }.bind(this));
        });
    }

    return p.promise;
};

function stillConnecting(schema, obj, args) {
    if (schema.connected) {
        return false;
    }
    var method = args.callee;
    schema.on('connected', function () {
        method.apply(obj, [].slice.call(args));
    });
    return true;
}

/**
 * Update or insert (create)
 * @param {Object} query - object.
 * @param {Object} data - object to find or create.
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.upsert = AbstractClass.updateOrCreate = function upsert(query, data, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    if (arguments.length === 1) {
        return;
    }
    if ('function' === typeof data) {
        callback = data;
        data = {};
    }
    var p = deferPromise();
    var Model = this;

    if (query.id) {
        this.findById(query.id, function (err, inst) {
            if (err) {
                if(!callback) p.reject(err);
                return callback && callback(err);
            }
            if (inst) {
                inst.updateAttributes(data, function (err) {
                    if (err) {
                        if(!callback) p.reject(err);
                    } else {
                        if(!callback) p.resolve();
                    }
                    return callback && callback(err);
                });
            } else {
                data = helpers.merge(data, query);
                var obj = new Model(data);
                obj.save(data, function (err) {
                    if (err) {
                        if(!callback) p.reject(err);
                    } else {
                        if(!callback) p.resolve();
                    }
                    return callback && callback(err);
                });
            }
        });
    } else {
        Model.all({
            where: query
        }, function (err, insts) {
            if (err || (insts && insts.length > 1)) {
                if (insts.length > 1) {
                    err = new Error('Found more than one record');
                    if(!callback) p.reject(err);
                    return callback && callback(err, insts);
                }
                if (err.message && !/NotFound/gi.test(err.message)) {
                    if(!callback) p.reject(err);
                    return callback && callback(err, insts);
                }
            }
            if (insts[0]) {
                var inst = insts[0];
                inst.updateAttributes(data, function (err) {
                    if (err) {
                        if(!callback) p.reject(err);
                    } else {
                        if(!callback) p.resolve(inst);
                    }
                    return callback && callback(err, inst);
                });
            } else {
                data = helpers.merge(data, query);
                var obj = new Model(data);
                obj.save(data, function (err) {
                    if (err) {
                        if(!callback) p.reject(err);
                    } else {
                        if(!callback) p.resolve(obj);
                    }
                    return callback && callback(err, obj);
                });
            }
        });
    }
    return p.promise;
};

/**
 * Find one record, same as `all`, limited by 1 and return object, not collection,
 * if not found, create using data provided as second argument
 *
 * @param {Object} query - search conditions: {where: {test: 'me'}}.
 * @param {Object} data - object to create.
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.findOrCreate = function findOrCreate(query, data, callback) {
    if (stillConnecting(this.schema, this, arguments))
        return;
    if (arguments.length === 1) {
        return;
    }
    if ('function' === typeof data) {
        callback = data;
        data = {};
    }
    var self = this;
    var p = deferPromise();
    this.findOne({where: query}, function (err, record) {
        if (err) {
            if(!callback) p.reject(err);
            return callback && callback(err);
        }
        if (record) {
            if(!callback) p.resolve(record);
            return callback && callback(null, record);
        }
        data = helpers.merge(query, data);
        self.create(data, function (err, record) {
            if (err) {
                if(!callback) p.reject(err);
            } else {
                if(!callback) p.resolve(record);
            }
            return callback && callback(err, record);
        });
    });
    return p.promise;
};

/**
 * Check whether object exitst in database
 *
 * @param {id} id - identifier of object (primary key value)
 * @param {Function} callback - callbacl called with (err, exists: Bool)
 */
AbstractClass.exists = function exists(id, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    var p = deferPromise();
    if (id) {
        id = getInstanceId(id);
        this.schema.adapter.exists(this.modelName, id, function (err, data) {
            if (err) {
                if(!callback) p.reject(err);
            } else {
                if(!callback) p.resolve(data);
            }
            return callback && callback(err, data);
        });
    } else {
        var err = new Error('Model::exists requires positive id argument');
        if(!callback) p.reject(err);
        return callback && callback(err);
    }
    return p.promise;
};

/**
 * Find all instances of Model, matched by query
 * make sure you have marked as `index: true` fields for filter or sort
 *
 * @param {Object} params (optional)
 *
 * - where: Object `{ key: val, key2: {gt: 'val2'}}`
 * - include: String, Object or Array. See AbstractClass.include documentation.
 * - order: String
 * - limit: Number
 * - skip: Number
 *
 * @param {Function} callback (required) called with arguments:
 *
 * - err (null or Error)
 * - Array of instances
 */
AbstractClass.find = AbstractClass.exec = AbstractClass.run = AbstractClass.all = function all(params, callback) {
    if ('function' === typeof params) {
        callback = params;
        params = {};
    }
    params = params ? params : {};
    if (typeof callback === 'undefined' && !params.where && !params.order && !params.limit) {
        return new Query(this.schema.models[this.modelName], 'all', params);
    } else {
        if (stillConnecting(this.schema, this, arguments)) {
            return null;
        }
        var p = deferPromise();
        params = buildQuery(params, this);
        var Constr = this;
        this.schema.adapter.all(this.modelName, params, function (err, data) {
            if (!err && data && data.map) {
                data.forEach(function (d, i) {
                    var obj = new Constr();
                    obj._initProperties(d, false);
                    data[i] = obj;
                });
                // if (data && data.countBeforeLimit) {
                //     data['countBeforeLimit'] = data.countBeforeLimit;
                // }
                if(!callback) p.resolve(data);
                return callback && callback(err, data);
            } else {
                if(!callback) p.reject(err);
                return callback && callback(err, []);
            }
        });
        return p.promise;
    }
};

/**
 * Find object by id
 *
 * @param {id} id - primary key value
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.findById = function findById(id, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    id = getInstanceId(id);
    var p = deferPromise();
    this.schema.adapter.findById(this.modelName, id, function (err, data) {
        var obj = null;
        if (data) {
            if (!data.id) {
                data.id = id;
            }
            obj = new this();
            obj._initProperties(data, false);
        }
        if (err) {
            if(!callback) p.reject(err);
        } else {
            if(!callback) p.resolve(obj);
        }
        return callback && callback(err, obj);
    }.bind(this));
    return p.promise;
};

/**
 * Find one record, same as `all`, limited by 1 and return object, not collection
 *
 * @param {Object} params - search conditions: {where: {test: 'me'}}
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.findOne = function findOne(params, callback) {
    if ('function' === typeof params) {
        callback = params;
        params = {};
    }
    if (typeof callback === 'undefined' && !(params || {}).where) {
        return new Query(this.schema.models[this.modelName], 'findOne', params);
    } else {
        if (stillConnecting(this.schema, this, arguments)) {
            return null;
        }

        if (typeof params === 'undefined') {
            this.q.params.limit = 1;
            return this;
        } else {
            var p = deferPromise();
            if (typeof params === 'function') {
                callback = params;
                params = {};
            }
            params = buildQuery(params, this);
            params.limit = 1;
            this.all(params, function (err, collection) {
                if (err || !collection || !collection.length > 0) {
                    if(!callback) p.reject(err);
                    return callback && callback(err, null);
                }
                if(!callback) p.resolve(collection[0]);
                return callback && callback(err, collection[0]);
            });
            return p.promise;
        }
    }
};

function substractDirtyAttributes(object, data) {
    Object.keys(object.toObject()).forEach(function (attr) {
        if (data.hasOwnProperty(attr) && object.propertyChanged(attr)) {
            delete data[attr];
        }
    });
}

/**
 * Destroy all records
 * @param {Function} callback - callback called with (err)
 */
AbstractClass.destroyAll = function destroyAll(callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    var p = deferPromise();
    this.schema.adapter.destroyAll(this.modelName, function (err) {
        if (err) {
            if(!callback) p.reject(err);
        } else {
            if(!callback) p.resolve(null);
        }
        return callback && callback(err);
    }.bind(this));
    return p.promise;
};

/**
 * Return count of matched records
 *
 * @param {Object} params - search conditions (optional)
 * @param {Function} callback - callback, called with (err, count)
 */
AbstractClass.count = function (params, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }
    var p = deferPromise();
    params = buildQuery(params, this);
    this.schema.adapter.count(this.modelName, function(err, count){
        if (err) {
            if(!callback) p.reject(err);
        } else {
            if(!callback) p.resolve(count);
        }
        return callback && callback(err, count);
    }, params);
    return p.promise;
};

/**
 * Allows you to load relations of several objects and optimize numbers of requests.
 *
 * @param {Array} objects - array of instances
 * @param {String|Object|Array} include - which relations you want to load.
 * @param {Function} callback - Callback called when relations are loaded
 *
 * Examples:
 *
 * - User.include(users, 'posts', function() {}); will load all users posts with only one additional request.
 * - User.include(users, ['posts'], function() {}); // same
 * - User.include(users, ['posts', 'passports'], function() {}); // will load all users posts and passports with two
 *     additional requests.
 * - Passport.include(passports, {owner: 'posts'}, function() {}); // will load all passports owner (users), and all
 *     posts of each owner loaded
 * - Passport.include(passports, {owner: ['posts', 'passports']}); // ...
 * - Passport.include(passports, {owner: [{posts: 'images'}, 'passports']}); // ...
 */
AbstractClass.include = function (objects, include, callback) {
    var self = this;

    if (
        (include.constructor.name === 'Array' && include.length === 0) ||
        (include.constructor.name === 'Object' && Object.keys(include).length === 0)
    ) {
        callback(null, objects);
        return;
    }

    include = processIncludeJoin(include);

    var keyVals = {};
    var objsByKeys = {};

    var nbCallbacks = 0;
    for (var i = 0; i < include.length; i++) {
        var cb = processIncludeItem(objects, include[i], keyVals, objsByKeys);
        if (cb !== null) {
            nbCallbacks++;
            cb(function () {
                if (--nbCallbacks === 0) {
                    callback(null, objects);
                }
            });
        } else {
            callback(null, objects);
        }
    }

    function processIncludeJoin(ij) {
        if (typeof ij === 'string') {
            ij = [ij];
        }
        if (ij.constructor.name === 'Object') {
            var newIj = [];
            for (var key in ij) {
                var obj = {};
                obj[key] = ij[key];
                newIj.push(obj);
            }
            return newIj;
        }
        return ij;
    }

    function processIncludeItem(objs, include, keyVals, objsByKeys) {
        var relations = self.relations, relationName, subInclude;

        if (include.constructor.name === 'Object') {
            relationName = Object.keys(include)[0];
            subInclude = include[relationName];
        } else {
            relationName = include;
            subInclude = [];
        }
        var relation = relations[relationName];

        var req = {
            'where': {}
        };

        if (!keyVals[relation.keyFrom]) {
            objsByKeys[relation.keyFrom] = {};
            for (var j = 0; j < objs.length; j++) {
                if (!objsByKeys[relation.keyFrom][objs[j][relation.keyFrom]]) {
                    objsByKeys[relation.keyFrom][objs[j][relation.keyFrom]] = [];
                }
                objsByKeys[relation.keyFrom][objs[j][relation.keyFrom]].push(objs[j]);
            }
            keyVals[relation.keyFrom] = Object.keys(objsByKeys[relation.keyFrom]);
        }

        if (keyVals[relation.keyFrom].length > 0) {
            // deep clone is necessary since inq seems to change the processed array
            var keysToBeProcessed = {};
            var inValues = [];
            for (var f = 0; f < keyVals[relation.keyFrom].length; f++) {
                keysToBeProcessed[keyVals[relation.keyFrom][f]] = true;
                if (keyVals[relation.keyFrom][f] !== 'null') {
                    inValues.push(keyVals[relation.keyFrom][f]);
                }
            }

            req['where'][relation.keyTo] = {
                inq: inValues
            };
            req['include'] = subInclude;

            return function (clbk) {
                relation.modelTo.all(req, function (err, objsIncluded) {
                    for (var i = 0; i < objsIncluded.length; i++) {
                        delete keysToBeProcessed[objsIncluded[i][relation.keyTo]];
                        var objectsFrom = objsByKeys[relation.keyFrom][objsIncluded[i][relation.keyTo]];
                        for (var j = 0; j < objectsFrom.length; j++) {
                            if (!objectsFrom[j].__cachedRelations) {
                                objectsFrom[j].__cachedRelations = {};
                            }
                            if (relation.multiple) {
                                if (!objectsFrom[j].__cachedRelations[relationName]) {
                                    objectsFrom[j].__cachedRelations[relationName] = [];
                                }
                                objectsFrom[j].__cachedRelations[relationName].push(objsIncluded[i]);
                            } else {
                                objectsFrom[j].__cachedRelations[relationName] = objsIncluded[i];
                            }
                        }
                    }

                    // No relation have been found for these keys
                    for (var key in keysToBeProcessed) {
                        var objectsFromRelation = objsByKeys[relation.keyFrom][key];
                        for (var n = 0; n < objectsFromRelation.length; n++) {
                            if (!objectsFromRelation[n].__cachedRelations) {
                                objectsFromRelation[n].__cachedRelations = {};
                            }
                            objectsFromRelation[n].__cachedRelations[relationName] = relation.multiple ? [] : null;
                        }
                    }
                    clbk(err, objsIncluded);
                });
            };
        }
        return null;
    }
};

/**
 * Return string representation of class
 * @override default toString method
 */
AbstractClass.toString = function () {
    return '[Model ' + this.modelName + ']';
};

/**
 * Save instance. When instance haven't id, create method called instead.
 * Triggers: validate, save, update | create
 * @param {Object} options {validate: true, throws: false} [optional]
 * @param {Function} callback - (err, obj)
 */
AbstractClass.prototype.save = function (options, callback) {
    if (stillConnecting(this.constructor.schema, this, arguments)) {
        return;
    }
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    callback = callback || function () {
        };
    options = options || {};

    if (!('validate' in options)) {
        options.validate = true;
    }
    if (!('throws' in options)) {
        options['throws'] = false;
    }

    if (options.validate) {
        this.isValid(function (valid) {
            if (valid) {
                save.call(this);
            } else {
                var err = new Error('Validation error');
                // throws option is dangerous for async usage
                if (options['throws']) {
                    throw err;
                }
                callback(err, this);
            }
        }.bind(this));
    } else {
        save.call(this);
    }

    function save() {
        this.trigger('save', function (saveDone) {
            var modelName = this.constructor.modelName;
            var data = this.toObject(true);
            var inst = this;

            if (inst.id) {
                data.id = inst.id;
                inst.trigger('update', function (updateDone) {
                    inst._adapter().save(modelName, inst.constructor._forDB(data), function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            inst._initProperties(data, false);
                        }
                        updateDone.call(inst, function () {
                            saveDone.call(inst, function () {
                                callback(err, inst);
                            });
                        });
                    });
                }, data);
            } else {
                inst.constructor.create(inst, function (err) {
                    saveDone.call(inst, function () {
                        callback(err, inst);
                    });
                });
            }
        });
    }
};

AbstractClass.prototype.isNewRecord = function () {
    return !this.id;
};

/**
 * Return adapter of current record
 * @private
 */
AbstractClass.prototype._adapter = function () {
    return this.constructor.schema.adapter;
};

/**
 * Convert instance to Object
 *
 * @param {Boolean} onlySchema - restrict properties to schema only, default false
 * when onlySchema == true, only properties defined in schema returned,
 * otherwise all enumerable properties returned
 * @returns {Object} - canonical object representation (no getters and setters)
 */
AbstractClass.prototype.toObject = function (onlySchema) {
    var data = {}, self = this;
    this.constructor.forEachProperty(function (attr) {
        if (self[attr] instanceof List) {
            data[attr] = self[attr].toObject();
        } else if (self.__data.hasOwnProperty(attr)) {
            data[attr] = self[attr];
        } else {
            data[attr] = null;
        }
    });

    if (!onlySchema) {
        Object.keys(self).forEach(function (attr) {
            if (!data.hasOwnProperty(attr)) {
                data[attr] = this[attr];
            }
        });
    }

    return data;
};

// AbstractClass.prototype.hasOwnProperty = function (prop) {
//     return this.__data && this.__data.hasOwnProperty(prop) ||
//         Object.getOwnPropertyNames(this).indexOf(prop) !== -1;
// };

AbstractClass.prototype.toJSON = function () {
    return this.toObject();
};

/**
 * Delete object from persistence
 * @param {Function} callback called with (error)
 * @triggers `destroy` hook (async) before and after destroying object
 */
AbstractClass.prototype.destroy = function (callback) {
    if (stillConnecting(this.constructor.schema, this, arguments)) {
        return;
    }
    this.trigger('destroy', function (destroyed) {
        this._adapter().destroy(this.constructor.modelName, this.id, function (err) {
            destroyed(function () {
                return callback && callback(err);
            });
        }.bind(this));
    });
};

/**
 * Destroy records
 * @param {Object|String|Number} id - remove conditions
 * @param {Function} callback - callback called with (err)
 */
AbstractClass.destroyById = function destroyById(id, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    var p = deferPromise();
    id = getInstanceId(id);
    this.findById(id, function (err, inst) {
        if (inst) {
            inst.destroy(function (err) {
                if (err) {
                    if(!callback) p.reject(err);
                } else {
                    if(!callback) p.resolve(null);
                }
                return callback && callback(err);
            });
        } else {
            if(!callback) p.reject(err);
            return callback && callback(err);
        }
    }.bind(this));
    return p.promise;
};

/**
 * Destroy records
 * @param {Object} params - remove conditions
 * @param {Function} callback - callback called with (err)
 */
AbstractClass.remove = function remove(params, callback) {
    if (typeof callback === 'undefined') {
        return new Query(this.schema.models[this.modelName], 'remove', params);
    } else {
        if (stillConnecting(this.schema, this, arguments)) {
            return;
        }
        this.schema.adapter.remove(this.modelName, params, function (err) {
            // clearCache(this);
            callback(err);
        }.bind(this));
    }
};

/**
 * Update single attribute
 *
 * equals to `updateAttributes({name: value}, cb)
 *
 * @param {String} name - name of property
 * @param {Mixed} value - value of property
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.prototype.updateAttribute = function updateAttribute(name, value, callback) {
    var data = {};
    data[name] = value;
    this.updateAttributes(data, callback);
};

/**
 * Update set of attributes
 *
 * this method performs validation before updating
 *
 * @trigger `validation`, `save` and `update` hooks
 * @param {Object} data - data to update
 * @param {Function} callback - callback called with (err, instance)
 */
AbstractClass.prototype.updateAttributes = function updateAttributes(data, callback) {
    if (stillConnecting(this.constructor.schema, this, arguments)) {
        return;
    }
    var inst = this;
    var model = this.constructor.modelName;

    if (!data) {
        data = {};
    }

    // update instance's properties
    Object.keys(data).forEach(function (key) {
        inst[key] = data[key];
    });

    inst.isValid(function (valid) {
        if (!valid) {
            if (callback) {
                callback(new Error('Validation error'), inst);
            }
        } else {
            update();
        }
    });

    function update() {
        inst.trigger('save', function (saveDone) {
            inst.trigger('update', function (done) {
                Object.keys(data).forEach(function (key) {
                    data[key] = inst[key];
                });
                inst._adapter().updateAttributes(model, inst.id, inst.constructor._forDB(data), function (err) {
                    if (!err) {
                        // update _was attrs
                        Object.keys(data).forEach(function (key) {
                            inst.__dataWas[key] = inst.__data[key];
                        });
                    }
                    done.call(inst, function () {
                        saveDone.call(inst, function () {
                            callback(err, inst);
                        });
                    });
                });
            }, data);
        });
    }
};

/**
 * Update records
 * @param {Object} filter - update conditions
 * @param {Object} data - data to update
 * @param {Object} options - data to update
 * @param {Function} callback - callback called with (err)
 */
AbstractClass.update = function update(filter, data, options, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    var p = deferPromise();
    if (this.schema.adapter.update) {
        var args = [this.modelName, filter, data];
        if (options && typeof options !== 'function') args.push(options);
        else if(typeof options === 'function') callback = options;
        args.push(function (err, affected) {
            affected = {affected: affected || 0};
            if (err) {
                if(!callback) p.reject(err);
            } else {
                if(!callback) p.resolve(affected);
            }
            return callback && callback(err, affected);
        });
        this.schema.adapter.update.apply(this.schema.adapter, args);
    } else {
        var err = new Error('Method update undefined for this adapter');
        if(!callback) p.reject(err);
        callback && callback(err);
    }
    return p.promise;
};

AbstractClass.prototype.fromObject = function (obj) {
    Object.keys(obj).forEach(function (key) {
        this[key] = obj[key];
    }.bind(this));
};

/**
 * Checks is property changed based on current property and initial value
 *
 * @param {String} attr - property name
 * @return Boolean
 */
AbstractClass.prototype.propertyChanged = function propertyChanged(attr) {
    return this.__data[attr] !== this.__dataWas[attr];
};

/**
 * Reload object from persistence
 *
 * @requires `id` member of `object` to be able to call `find`
 * @param {Function} callback - called with (err, instance) arguments
 */
AbstractClass.prototype.reload = function reload(callback) {
    if (stillConnecting(this.constructor.schema, this, arguments)) {
        return;
    }
    this.constructor.findById(this.id, callback);
};

/**
 * Reset dirty attributes
 *
 * this method does not perform any database operation it just reset object to it's
 * initial state
 */
AbstractClass.prototype.reset = function () {
    var obj = this;
    Object.keys(obj).forEach(function (k) {
        if (k !== 'id' && !obj.constructor.schema.definitions[obj.constructor.modelName].properties[k]) {
            delete obj[k];
        }
        if (obj.propertyChanged(k)) {
            obj[k] = obj[k + '_was'];
        }
    });
};

/**
 * Declare hasMany relation
 *
 * @param {Class} anotherClass - class to has many
 * @param {Object} params - configuration {as:, foreignKey:}
 * @example `User.hasMany(Post, {as: 'posts', foreignKey: 'authorId'});`
 */
AbstractClass.hasMany = function hasMany(anotherClass, params) {
    var methodName = params.as || pluralize(anotherClass.modelName);
    var fk = params.foreignKey;

    this.relations[methodName] = {
        type: 'hasMany',
        keyFrom: 'id',
        keyTo: fk,
        modelTo: anotherClass,
        multiple: true
    };

    // each instance of this class should have method named
    // which is actually just anotherClass.all({where: {thisModelNameId: this.id}}, cb);
    defineScope(this.prototype, anotherClass, methodName, function () {
        var x = {}, id;
        if (this.id && typeof this.id === 'object') {
            id = this.id.toString();
        } else {
            id = this.id;
        }
        x[fk] = id;
        return {
            where: x
        };
    }, {
        find: find,
        update: update,
        destroy: destroy,
        remove: remove
    });

    // obviously, anotherClass should have attribute called `fk`
    anotherClass.schema.defineForeignKey(anotherClass.modelName, fk);

    function find(query, callback) {
        if (!callback && typeof query === 'function') {
            callback = query;
            query = {
                where: {}
            };
        } else {
            if (!query.where) {
                query.where = {};
            }
        }
        query.where[fk] = typeof this.id === 'object' ? this.id.toString() : this.id;
        anotherClass.all(query, function (err, inst) {
            if (err) {
                return callback(err);
            }
            callback(null, inst);
        }.bind(this));
    }

    function update(query, data, callback) {
        if (!query.where) {
            query.where = {};
        }
        query.where[fk] = typeof this.id === 'object' ? this.id.toString() : this.id;
        anotherClass.update(query, data, function (err, inst) {
            if (err) {
                return callback(err);
            }
            callback(null, inst);
        }.bind(this));
    }

    function remove(query, callback) {
        if (!callback && typeof query === 'function') {
            callback = query;
            query = {
                where: {}
            };
        } else {
            if (!query.where) {
                query.where = {};
            }
        }
        query.where[fk] = typeof this.id === 'object' ? this.id.toString() : this.id;
        anotherClass.remove(query, function (err, inst) {
            if (err) {
                return callback(err);
            }
            callback(null, inst);
        }.bind(this));
    }

    function destroy(id, callback) {
        id = typeof id === 'object' ? id.toString() : id;
        this.findById(id, function (err, inst) {
            if (err)
                return callback(err);
            if (inst) {
                inst.destroy(callback);
            } else {
                callback(new Error('Not found'));
            }
        });
    }
};

/**
 * Declare belongsTo relation
 *
 * @param {Class} anotherClass - class to belong
 * @param {Object} params - configuration {as: 'propertyName', foreignKey: 'keyName'}
 *
 * **Usage examples**
 * Suppose model Post have a *belongsTo* relationship with User (the author of the post). You could declare it this way:
 * Post.belongsTo(User, {as: 'author', foreignKey: 'userId'});
 *
 * When a post is loaded, you can load the related author with:
 * post.author(function(err, user) {
 *     // the user variable is your user object
 * });
 *
 * The related object is cached, so if later you try to get again the author, no additional request will be made.
 * But there is an optional boolean parameter in first position that set whether or not you want to reload the cache:
 * post.author(true, function(err, user) {
 *     // The user is reloaded, even if it was already cached.
 * });
 *
 * This optional parameter default value is false, so the related object will be loaded from cache if available.
 */
AbstractClass.belongsTo = function (anotherClass, params) {
    var modelName = this.modelName;
    var methodName = params.as;
    var fk = params.foreignKey;

    this.relations[params['as']] = {
        type: 'belongsTo',
        keyFrom: params['foreignKey'],
        keyTo: 'id',
        modelTo: anotherClass,
        multiple: false
    };

    this.schema.defineForeignKey(modelName, fk);
    this.prototype['__finders__'] = this.prototype['__finders__'] || {};

    this.prototype['__finders__'][methodName] = function (id, cb) {
        if (id === null) {
            cb(null, null);
            return;
        }
        anotherClass.findById(id, function (err, inst) {
            if (!inst) {
                return cb(new Error(modelName + ' belongsTo ' + anotherClass.modelName + ' via foreign key ' + fk + ' error'));
            }
            var sid = typeof inst.id === 'object' ? inst.id.toString() : inst.id;
            var fid = typeof this[fk] === 'object' ? this[fk].toString() : this[fk];
            if (err) {
                return cb(err);
            }
            if (!inst)
                return cb(null, null);
            if (sid === fid) {
                cb(null, inst);
            } else {
                cb(new Error('Permission denied'));
            }
        }.bind(this));
    };

    this.prototype[methodName] = function (refresh, p) {
        if (arguments.length === 1) {
            p = refresh;
            refresh = false;
        } else if (arguments.length > 2) {
            throw new Error('Method can\'t be called with more than two arguments');
        }
        var self = this;
        var cachedValue;
        if (!refresh && this.__cachedRelations && (typeof this.__cachedRelations[methodName] !== 'undefined')) {
            cachedValue = this.__cachedRelations[methodName];
        }
        if (p instanceof AbstractClass) { // acts as setter
            this[fk] = p.id;
            this.__cachedRelations[methodName] = p;
        } else if (typeof p === 'function') { // acts as async getter
            if (typeof cachedValue === 'undefined') {
                this.__finders__[methodName].apply(self, [this[fk], function (err, inst) {
                    if (!err) {
                        self.__cachedRelations[methodName] = inst;
                    }
                    p(err, inst);
                }]);
                return this[fk];
            } else {
                p(null, cachedValue);
                return cachedValue;
            }
        } else if (typeof p === 'undefined') { // acts as sync getter
            return this[fk];
        } else { // setter
            this[fk] = p;
            delete this.__cachedRelations[methodName];
        }
    };
};

/**
 * Define scope
 * TODO: describe behavior and usage examples
 *
 * @param {String} name - scope name
 * @param {Object} params - scope condition
 */
AbstractClass.scope = function (name, params) {
    defineScope(this, this, name, params);
};

function defineScope(cls, targetClass, name, params, methods) {

    // collect meta info about scope
    if (!cls._scopeMeta) {
        cls._scopeMeta = {};
    }

    // only makes sence to add scope in meta if base and target classes
    // are same
    if (cls === targetClass) {
        cls._scopeMeta[name] = params;
    } else {
        if (!targetClass._scopeMeta) {
            targetClass._scopeMeta = {};
        }
    }

    Object.defineProperty(cls, name, {
        enumerable: false,
        configurable: true,
        get: function () {
            var f = function caller(condOrRefresh, cb) {
                var actualCond = {};
                var actualRefresh = false;
                var saveOnCache = true;
                if (arguments.length === 1) {
                    cb = condOrRefresh;
                } else if (arguments.length === 2) {
                    if (typeof condOrRefresh === 'boolean') {
                        actualRefresh = condOrRefresh;
                    } else {
                        actualCond = condOrRefresh;
                        actualRefresh = true;
                        saveOnCache = false;
                    }
                } else {
                    throw new Error('Method can be only called with one or two arguments');
                }

                if (!this.__cachedRelations || (typeof this.__cachedRelations[name] === 'undefined') || actualRefresh) {
                    var self = this;
                    return targetClass.all(mergeParams(actualCond, caller._scope), function (err, data) {
                        if (!err && saveOnCache) {
                            self.__cachedRelations[name] = data;
                        }
                        cb(err, data);
                    });
                } else {
                    cb(null, this.__cachedRelations[name]);
                }
            };

            f._scope = typeof params === 'function' ? params.call(this) : params;
            f.build = build;
            f.create = create;
            f.destroy = destroy;
            f.destroyAll = destroyAll;
            for (var i in methods) {
                f[i] = methods[i].bind(this);
            }

            // define sub-scopes
            Object.keys(targetClass._scopeMeta).forEach(function (name) {
                Object.defineProperty(f, name, {
                    enumerable: false,
                    get: function () {
                        mergeParams(f._scope, targetClass._scopeMeta[name]);
                        return f;
                    }
                });
            }.bind(this));
            return f;
        }
    });

    // and it should have create/build methods with binded thisModelNameId param
    function build(data) {
        return new targetClass(mergeParams(this._scope, {
            where: data || {}
        }).where);
    }

    function create(data, cb) {
        if (typeof data === 'function') {
            cb = data;
            data = {};
        }
        this.build(data).save(cb);
    }

    function destroy(id, callback) {
        if (callback) {
            // TODO: impement
            callback();
        }
    }

    /*
     Callback
     - The callback will be called after all elements are destroyed
     - For every destroy call which results in an error
     - If fetching the Elements on which destroyAll is called results in an error
     */
    function destroyAll(callback) {
        targetClass.all(this._scope, function (err, data) {
            if (err) {
                callback(err);
            } else {
                (function loopOfDestruction(data) {
                    if (data.length > 0) {
                        data.shift().destroy(function (err) {
                            if (err && callback)
                                callback(err);
                            loopOfDestruction(data);
                        });
                    } else {
                        if (callback)
                            callback();
                    }
                }(data));
            }
        });
    }

    function mergeParams(base, update) {
        if (update && !update.where) {
            update = {
                where: update
            };
        }
        if (update.where) {
            base.where = helpers.merge(base.where, update.where);
        }
        // overwrite order
        if (update.order) {
            base.order = update.order;
        }
        return base;
    }
}

AbstractClass.prototype.inspect = function () {
    return util.inspect(this.__data, false, 4, true);
};

/**
 * Create index in collection
 *
 * @param {String|Object} fields - index name
 * @param {Object} params - indexed fields list { name : 1, created : -1 }
 * @param {Function} callback - callbacl called with (err, exists: Bool)
 */
AbstractClass.ensureIndex = function ensureIndex(fields, params, callback) {
    if (stillConnecting(this.schema, this, arguments)) {
        return;
    }
    if (typeof callback === 'undefined') {
        callback = function (err) {
            return err;
        };
    }

    if (typeof params === 'object') {
        if (typeof this.schema.adapter.ensureIndex === 'undefined') {
            callback(new Error('Model::ensureIndex not defined for this adapter'));
        } else {
            this.schema.adapter.ensureIndex(this.modelName, fields, params, callback);
        }
    } else {
        callback(new Error('Model::ensureIndex requires params argument'));
    }
};

function buildQuery(opts, model) {

    for (var okey in model.q.conditions) {
        if (typeof opts.where === 'undefined') {
            opts.where = {};
        }
        opts.where[okey] = model.q.conditions[okey];
    }
    model.q.conditions = {};

    for (var pkey in model.q.params) {
        if (typeof opts[pkey] === 'undefined') {
            opts[pkey] = {};
        }
        opts[pkey] = model.q.params[pkey];
    }
    model.q.params = {};
    model.q.pkey = false;
    return opts;
}

/**
 * Check whether `s` is not undefined
 * @param {Mixed} s
 * @return {Boolean} s is undefined
 */
function isdef(s) {
    var undef;
    return s !== undef;
}

/**
 * Define readonly property on object
 *
 * @param {Object} obj
 * @param {String} key
 * @param {Mixed} value
 */
function defineReadonlyProp(obj, key, value) {
    Object.defineProperty(obj, key, {
        writable: false,
        enumerable: true,
        configurable: true,
        value: value
    });
}

/**
 * Normalize id
 *
 * @param {Mixed} id
 */
function getInstanceId(id) {
    if (typeof id === 'object' && id.constructor === Array) {
        id = id[0];
    }
    return id;
}
