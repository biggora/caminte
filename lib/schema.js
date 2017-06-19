/**
 * Module dependencies
 */
var utils = require('./utils');
var ainst = require('./abstract-class');
var AbstractClass = ainst.AbstractClass;
var getState = utils.getState;
var util = require('util');
var path = require('path');
var events = require('events');
var fs = require('fs');
var existsSync = fs.existsSync || path.existsSync;

/**
 * Export public API
 */
exports.Schema = Schema;

/**
 * Helpers
 */
var slice = Array.prototype.slice;

/**
 * Schema - adapter-specific classes factory.
 *
 * All classes in single schema shares same adapter type and
 * one database connection
 *
 * @param name - type of schema adapter (mysql, mongoose, sequelize, redis)
 * @param settings - any database-specific settings which we need to
 * establish connection (of course it depends on specific adapter)
 *
 * - host
 * - port
 * - username
 * - password
 * - database
 * - debug {Boolean} = false
 *
 * @example Schema creation, waiting for connection callback
 * ```
 * var schema = new Schema('mysql', { database: 'myapp_test' });
 * schema.define(...);
 * schema.on('connected', function () {
 *     // work with database
 * });
 * ```
 */
function Schema(name, settings) {
    var schema = this;

    name = name ? name.toLowerCase() : '';
    switch (name) {
        case 'sqlite':
            name = 'sqlite3';
            break;
        case 'mysqldb':
        case 'mariadb':
            name = 'mysql';
            break;
        case 'mongo':
            name = 'mongodb';
            break;
        case 'couchdb':
        case 'couch':
            name = 'nano';
            break;
        case 'rethinkdb':
        case 'rethink':
            name = 'rethinkdb';
            break;
    }

    // just save everything we get
    schema.name = name;
    schema.settings = settings;

    // Disconnected by default
    schema.connected = false;

    // create blank models pool
    schema.models = {};
    schema.definitions = {};

    // define schema types
    schema.Text = function Text() {
    };
    schema.JSON = schema.Json = function JSON() {
    };
    schema.Float = function Float() {
    };
    schema.Real = schema.Double = function Real() {
    };
    schema.Int = schema.Integer = function Integer() {
    };
    schema.UUID = schema.Uuid = function UUID() {
    };
    schema.TimeUUID = schema.TimeUuid = function TimeUUID() {
    };
    schema.CounterColumn = function CounterColumn() {
    };
    schema.Blob = schema.Bytes = function Blob() {
    };

    schema.Date = schema.Timestamp = Date;
    schema.Boolean = schema.Tinyint = Boolean;
    schema.Number = Number;
    schema.String = schema.Varchar = String;
    // and initialize schema using adapter
    // this is only one initialization entry point of adapter
    // this module should define `adapter` member of `this` (schema)
    var adapter;
    if (typeof name === 'object') {
        adapter = name;
        schema.name = adapter.name;
    } else if (name.match(/^\//)) {
        // try absolute path
        adapter = require(name);
    } else if (existsSync(__dirname + '/adapters/' + name + '.js')) {
        // try built-in adapter
        adapter = require('./adapters/' + name);
    } else {
        try {
            adapter = require('caminte-' + name);
        } catch (e) {
            throw new Error('Adapter ' + name + ' is not defined, try\n  npm install ' + name);
        }
    }

    adapter.initialize(schema, function () {

        // we have an adaper now?
        if (!schema.adapter) {
            throw new Error('Adapter is not defined correctly: it should create `adapter` member of schema');
        }

        schema.adapter.log = function (query, start) {
            schema.log(query, start);
        };

        schema.adapter.logger = function (query) {
            'use strict';
            var t1 = Date.now();
            var log = schema.log;
            return function (q) {
                log(q || query, t1);
            };
        };
        var res = getState(schema);
        if (util.isError(res)) {
            schema.emit('error', res);
        } else {
            schema.connected = true;
            schema.emit('connected');
        }
    }.bind(schema));
}

util.inherits(Schema, events.EventEmitter);

Schema.Text = function Text() {
};
Schema.JSON = function JSON() {
};
/**
 * Define class
 *
 * @param {String} className
 * @param {Object} properties - hash of class properties in format
 *   `{property: Type, property2: Type2, ...}`
 *   or
 *   `{property: {type: Type}, property2: {type: Type2}, ...}`
 * @param {Object} settings - other configuration of class
 * @return newly created class
 *
 * @example simple case
 * ```
 * var User = schema.define('User', {
 *     email: String,
 *     password: String,
 *     birthDate: Date,
 *     activated: Boolean
 * });
 * ```
 * @example more advanced case
 * ```
 * var User = schema.define('User', {
 *     email: { type: String, limit: 150, index: true },
 *     password: { type: String, limit: 50 },
 *     birthDate: Date,
 *     registrationDate: {type: Date, default: function () { return new Date }},
 *     activated: { type: Boolean, default: false }
 * });
 * ```
 */
Schema.prototype.define = function defineClass(className, properties, settings) {
    'use strict';
    var schema = this;
    var args = slice.call(arguments);

    if (!className) {
        throw new Error('Class name required');
    }
    if (args.length === 1) {
        properties = {}, args.push(properties);
    }
    if (args.length === 2) {
        settings = {}, args.push(settings);
    }

    standartize(properties, settings);

    // every class can receive hash of data as optional param
    var NewClass = function ModelConstructor(data) {
        if (!(this instanceof ModelConstructor)) {
            return new ModelConstructor(data);
        }
        AbstractClass.call(this, data);
    };

    hiddenProperty(NewClass, 'schema', schema);
    hiddenProperty(NewClass, 'modelName', className);
    hiddenProperty(NewClass, 'cache', {});
    hiddenProperty(NewClass, 'mru', []);
    hiddenProperty(NewClass, 'relations', {});

    // inherit AbstractClass methods
    for (var i in AbstractClass) {
        NewClass[i] = AbstractClass[i];
    }
    for (var j in AbstractClass.prototype) {
        NewClass.prototype[j] = AbstractClass.prototype[j];
    }

    NewClass.getter = {};
    NewClass.setter = {};

    // store class in model pool
    this.models[className] = NewClass;
    this.definitions[className] = {
        properties: properties,
        settings: settings
    };

    // pass controll to adapter
    this.adapter.define({
        model: NewClass,
        properties: properties,
        settings: settings
    });

    if (!settings.primaryKeys) {
        NewClass.prototype.__defineGetter__('id', function () {
            return this.__data.id;
        });
        properties.id = properties.id || {type: Number};
    }

    NewClass.forEachProperty = function (cb) {
        Object.keys(properties).forEach(cb);
    };

    NewClass.registerProperty = function (attr) {
        Object.defineProperty(NewClass.prototype, attr, {
            get: function () {
                'use strict';
                if (NewClass.getter[attr]) {
                    return NewClass.getter[attr].call(this);
                } else {
                    return this.__data[attr];
                }
            },
            set: function (value) {
                'use strict';
                if (NewClass.setter[attr]) {
                    NewClass.setter[attr].call(this, value);
                } else {
                    this.__data[attr] = value;
                }
            },
            configurable: true,
            enumerable: true
        });

        NewClass.prototype.__defineGetter__(attr + '_was', function () {
            return this.__dataWas[attr];
        });

        Object.defineProperty(NewClass.prototype, '_' + attr, {
            get: function () {
                return this.__data[attr];
            },
            set: function (value) {
                this.__data[attr] = value;
            },
            configurable: true,
            enumerable: false
        });
    };

    NewClass.forEachProperty(NewClass.registerProperty);

    return NewClass;
};

function standartize(properties, settings) {
    Object.keys(properties).forEach(function (key) {
        var v = properties[key];
        if (
            typeof v === 'function' ||
            typeof v === 'object' && v && v.constructor.name === 'Array'
        ) {
            properties[key] = {type: v};
        }
    });
    // TODO: add timestamps fields
    // when present in settings: {timestamps: true}
    // or {timestamps: {created: 'created_at', updated: false}}
    // by default property names: createdAt, updatedAt
}
/**
 * Define single property named `prop` on `model`
 *
 * @param {String} model - name of model
 * @param {String} prop - name of propery
 * @param {Object} params - property settings
 */
Schema.prototype.defineProperty = function (model, prop, params) {
    this.definitions[model].properties[prop] = params;
    this.models[model].registerProperty(prop);
    if (this.adapter.defineProperty) {
        this.adapter.defineProperty(model, prop, params);
    }
};

/**
 * Extend existing model with bunch of properties
 *
 * @param {String} model - name of model
 * @param {Object} props - hash of properties
 *
 * Example:
 *
 *     // Instead of doing this:
 *
 *     // amend the content model with competition attributes
 *     db.defineProperty('Content', 'competitionType', { type: String });
 *     db.defineProperty('Content', 'expiryDate', { type: Date, index: true });
 *     db.defineProperty('Content', 'isExpired', { type: Boolean, index: true });
 *
 *     // schema.extend allows to
 *     // extend the content model with competition attributes
 *     db.extendModel('Content', {
 *       competitionType: String,
 *       expiryDate: { type: Date, index: true },
 *       isExpired: { type: Boolean, index: true }
 *     });
 */
Schema.prototype.extendModel = function (model, props) {
    var t = this;
    standartize(props, {});
    Object.keys(props).forEach(function (propName) {
        var definition = props[propName];
        t.defineProperty(model, propName, definition);
    });
};

/**
 * Drop each model table and re-create.
 * This method make sense only for sql adapters.
 * @param {Function} cb
 *
 * @warning All data will be lost! Use autoupdate if you need your data.
 */
Schema.prototype.automigrate = function (cb) {
    this.freeze();
    if (this.adapter.automigrate) {
        this.adapter.automigrate(cb);
    } else if (cb) {
        cb();
    }
};

/**
 * Update existing database tables.
 * This method make sense only for sql adapters.
 * @param {Function} cb
 */
Schema.prototype.autoupdate = function (cb) {
    this.freeze();
    if (this.adapter.autoupdate) {
        this.adapter.autoupdate(cb);
    } else if (cb) {
        cb();
    }
};

/**
 * Check whether migrations needed
 * This method make sense only for sql adapters.
 * @param {Function} cb
 */
Schema.prototype.isActual = function (cb) {
    this.freeze();
    if (this.adapter.isActual) {
        this.adapter.isActual(cb);
    } else if (cb) {
        cb(null, true);
    }
};

/**
 * Log benchmarked message. Do not redefine this method, if you need to grab
 * chema logs, use `schema.on('log', ...)` emitter event
 * @param {String} sql
 * @param {Date} t
 *
 * @private used by adapters
 */
Schema.prototype.log = function (sql, t) {
    this.emit('log', sql, t);
};

/**
 * Freeze schema. Behavior depends on adapter
 */
Schema.prototype.freeze = function freeze() {
    if (this.adapter.freezeSchema) {
        this.adapter.freezeSchema();
    }
};

/**
 * Return table name for specified `modelName`
 * @param {String} modelName
 */
Schema.prototype.tableName = function (modelName) {
    return this.definitions[modelName].settings.table = this.definitions[modelName].settings.table || modelName;
};

/**
 * Define foreign key
 * @param {String} className
 * @param {String} key - name of key field
 */
Schema.prototype.defineForeignKey = function defineForeignKey(className, key) {
    // quit if key already defined
    if (this.definitions[className].properties[key])
        return;

    if (this.adapter.defineForeignKey) {
        this.adapter.defineForeignKey(className, key, function (err, keyType) {
            if (err)
                throw err;
            this.definitions[className].properties[key] = {type: keyType};
        }.bind(this));
    } else {
        this.definitions[className].properties[key] = {type: Number};
    }
    this.models[className].registerProperty(key);
};

/**
 * Start transaction
 *
 * @param {Object} params
 * @param {Function} callback
 */
Schema.prototype.begin = function begin(params, callback) {
    if (typeof callback === 'undefined') {
        callback = function (err) {
            return err;
        };
    }

    if (typeof this.adapter.begin === 'undefined') {
        callback(new Error('TRANSACTION::begin method not defined for this adapter'));
    } else {
        this.adapter.begin(params, callback);
    }
};

/**
 * Commit transaction
 *
 * @param {Object} params
 * @param {Function} callback
 */
Schema.prototype.commit = function commit(params, callback) {
    if (typeof callback === 'undefined') {
        callback = function (err) {
            return err;
        };
    }

    if (typeof this.adapter.commit === 'undefined') {
        callback(new Error('TRANSACTION::commit method not defined for this adapter'));
    } else {
        this.adapter.commit(params, callback);
    }
};

/**
 * Rollback transaction
 *
 * @param {Object} params
 * @param {Function} callback
 */
Schema.prototype.rollback = function rollback(params, callback) {
    if (typeof callback === 'undefined') {
        callback = function (err) {
            return err;
        };
    }

    if (typeof this.adapter.rollback === 'undefined') {
        callback(new Error('TRANSACTION::rollback method not defined for this adapter'));
    } else {
        this.adapter.rollback(params, callback);
    }
};

/**
 * Close database connection
 */
Schema.prototype.disconnect = function disconnect() {
    if (typeof this.adapter.disconnect === 'function') {
        this.connected = false;
        this.adapter.disconnect();
    }
};

/**
 * Returns an array of model names created on this instance of Schema.
 *
 * ####Note:
 *
 * _Does not include names of models created using `connection.model()`._
 *
 * @api public
 * @return {Array}
 */

Schema.prototype.modelNames = function () {
    var names = Object.keys(this.models);
    return names;
};

/**
 * Defines a model or retrieves it.
 *
 * Models defined on the `mongoose` instance are available to all connection created by the same `mongoose` instance.
 *
 * ####Example:
 *
 *     var mongoose = require('mongoose');
 *
 *     // define an Actor model with this mongoose instance
 *     mongoose.model('Actor', new Schema({ name: String }));
 *
 *     // create a new connection
 *     var conn = mongoose.createConnection(..);
 *
 *     // retrieve the Actor model
 *     var Actor = conn.model('Actor');
 *
 * _When no `collection` argument is passed, Mongoose produces a collection name by passing the model `name` to the [utils.toCollectionName](#utils_exports.toCollectionName) method. This method pluralizes the name. If you don't like this behavior, either pass a collection name or set your schemas collection name option._
 *
 * ####Example:
 *
 *     var schema = new Schema({ name: String }, { collection: 'actor' });
 *
 *     // or
 *
 *     schema.set('collection', 'actor');
 *
 *     // or
 *
 *     var collectionName = 'actor'
 *     var M = mongoose.model('Actor', schema, collectionName)
 *
 * @param {String} name model name
 * @param {Schema} [schema]
 * @param {String} [collection] name (optional, induced from model name)
 * @param {Boolean} [skipInit] whether to skip initialization (defaults to false)
 * @api public
 */

Schema.prototype.model = function (name, schema) {
    if ('string' === typeof schema) {
        schema = false;
    }

    if (typeof schema === 'object') {
        schema = new Schema(schema);
    }

    var model;

    // connection.model() may be passing a different schema for
    // an existing model name. in this case don't read from cache.
    if (this.models[name]) {
        model = this.models[name];
    }

    return model;
};

/**
 * Define hidden property
 * @param {Object} where
 * @param {String} property
 * @param {mixed} value
 */
function hiddenProperty(where, property, value) {
    Object.defineProperty(where, property, {
        writable: false,
        enumerable: false,
        configurable: false,
        value: value
    });
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
