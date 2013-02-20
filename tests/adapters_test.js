var caminte = require('../'),
    Schema = caminte.Schema,
    test = caminte.test;

var schema = new Schema('memory');

test(module.exports, schema);

test.skip('hasMany should be cached');

