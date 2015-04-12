var caminte = require('../index');
require('./spec_helper').init(module.exports);

it('should expose version', function (test) {
    test.ok(caminte.version);
    test.done();
});
