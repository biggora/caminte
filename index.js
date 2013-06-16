var util = require('util');
var path = require('path');
var fs = require('fs');
var Schema = require('./lib/schema').Schema;
var AbstractClass = require('./lib/abstract-class').AbstractClass;
var Validatable = require('./lib/validatable').Validatable;
var BaseSQL = './lib/sql';
var CommonTest = './tests/common_test';
var existsSync = fs.existsSync || path.existsSync;

function Caminte() {
    this.connections = [];
    this.plugins = [];
    this.models = {};
    this.modelSchemas = {};
    this.settings = {};
    // Disconnected by default
    this.connected = false;
    // this.createConnection();
    if(!global.Caminte) {
        global.Caminte = this;
    }
}

util.inherits(Caminte, require('events').EventEmitter);

Caminte.prototype.set = function (key, value) {
    if (arguments.length == 1)
        return this.options[key];
    this.options[key] = value;
    return this;
};
Caminte.prototype.get = Caminte.prototype.set;
Caminte.prototype.version = require(__dirname + '/package.json').version;
Caminte.prototype.Schema = Schema;
Caminte.prototype.AbstractClass = AbstractClass;
Caminte.prototype.Validatable = Validatable;

Caminte.prototype.model = function (className, params) {
    var self = this, Model;
    if('undefined' === typeof params) {
        Model = self.models[className] || null;
    } else {
        if(!self.schema) {
            if(!self.name) {
                self.name = self.settings.driver;
            }
            self.schema = new Schema(self.name, self.settings);
        }
        Model = self.schema.define(className, params);
        self.models[className] = Model;
    }
    return Model;
}

Caminte.prototype.modelNames = function () {
    var names = Object.keys(this.models);
    return names;
}

Caminte.prototype.createConnection = function (name, settings) {
    var self = this;
    self.settings = settings;
    var adapter;
    if (typeof name === 'object') {
        adapter = name;
        self.name = adapter.name;
    } else if (name.match(/^\//)) {
        // try absolute path
        adapter = require(name);
    } else if (existsSync(__dirname + '/lib/adapters/' + name + '.js')) {
        // try built-in adapter
        adapter = require('./lib/adapters/' + name);
    } else {
        try {
            adapter = require('caminte-' + name);
        } catch (e) {
            throw new Error('Adapter ' + name + ' is not defined, try\n  npm install ' + name);
        }
    }

    adapter.initialize(self, function () {

        // we have an adaper now?
        if (!self.adapter) {
            throw new Error('Adapter is not defined correctly: it should create `adapter` member of schema');
        }

        this.adapter.log = function (query, start) {
            self.log(query, start);
        };

        self.adapter.logger = function (query) {
            var t1 = Date.now();
            var log = self.log;
            return function (q) {
                log(q || query, t1);
            };
        };

        self.connected = true;
        self.emit('connected');

    }.bind(this));
}

Caminte.prototype.log = function (sql, t) {
    this.emit('log', sql, t);
};

Caminte.prototype.init = function (rw) {
    if (global.railway) {
        global.railway.orm = exports;
    } else {
        rw.orm = {
            Schema: exports.Schema,
            AbstractClass: exports.AbstractClass
        };
    }
    var railway = './lib/railway';
    require(railway)(rw);
};

Caminte.prototype.__defineGetter__('test', function () {
    return require(CommonTest);
});
Caminte.prototype.__defineGetter__('BaseSQL', function () {
    return require(BaseSQL);
});

try {
    if (process.versions.node < '0.6') {
        exports.version = JSON.parse(fs.readFileSync(__dirname + '/package.json')).version;
    } else {
        exports.version = require('./package').version;
    }
} catch (e) {}

var caminte = module.exports = exports = new Caminte;