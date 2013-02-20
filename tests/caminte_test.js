var caminte = require('../index');
require('./spec_helper').init(module.exports);

it('should expose version', function (test) {
    console.log('version:', caminte.version);
    test.ok(caminte.version);
    test.done();
});
