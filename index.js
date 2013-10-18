/**
 * Module dependencies
 */
var fs = require('fs');
var path = require('path');

Schema = require('./lib/schema').Schema;

exports.Schema = Schema;
exports.AbstractClass = require('./lib/abstract-class').AbstractClass;
exports.Validatable = require('./lib/validatable').Validatable;
exports.__defineGetter__('BaseSQL', function () {
    return require('./lib/sql');
});

exports.init = function (trinte) {
    if (global.trinte) {
        global.trinte.orm = exports;
    } else {
        trinte.orm = {Schema: exports.Schema, AbstractClass: exports.AbstractClass};
    }
   // var railway = './lib/railway';
   // require(railway)(rw);
};

try {
    if (process.versions.node < '0.6') {
        exports.version = JSON.parse(fs.readFileSync(__dirname + '/package.json')).version;
    } else {
        exports.version = require('./package').version;
    }
} catch (e) {}

exports.__defineGetter__('test', function () {
    return require('./tests/common_test');
});