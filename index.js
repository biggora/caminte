/**
 * Module dependencies
 */
var fs = require('fs');
var schema = require('./lib/schema');
var pkg = require('./package');
var abc = require('./lib/abstract-class');
var vld = require('./lib/validatable');

Schema = schema.Schema;

exports.Schema = Schema;
exports.AbstractClass = abc.AbstractClass;
exports.Validatable = vld.Validatable;
exports.__defineGetter__('BaseSQL', function () {
    return require('./lib/sql');
});

exports.init = function (trinte) {
    if (global.trinte) {
        global.trinte.orm = exports;
    } else {
        trinte.orm = {Schema: exports.Schema, AbstractClass: exports.AbstractClass};
    }
};

exports.version = pkg.version;

exports.__defineGetter__('test', function () {
    return require('./tmp/tests/common_test');
});