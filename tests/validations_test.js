var AbstractClass, Schema, User, Validatable, caminte, getValidAttributes, schema, validAttributes;

caminte = require('../index');
Schema = caminte.Schema;
AbstractClass = caminte.AbstractClass;
Validatable = caminte.Validatable;
require('./spec_helper').init(module.exports);
schema = new Schema('memory');

User = schema.define('User', {
  email: String,
  name: String,
  password: String,
  state: String,
  age: Number,
  gender: String,
  domain: String,
  pendingPeriod: Number,
  createdByAdmin: Boolean,
  createdByScript: Boolean,
  updatedAt: Date
});

validAttributes = {
  name: 'Alexey',
  email: 'email@example.com',
  state: '',
  age: 26,
  gender: 'male',
  domain: 'caminte',
  createdByAdmin: false,
  createdByScript: true
};

getValidAttributes = function() {
  return {
    name: 'Alexey',
    email: 'email@example.com',
    state: '',
    age: 26,
    gender: 'male',
    domain: 'caminte',
    createdByAdmin: false,
    createdByScript: true
  };
};

it('should validate presence', function(test) {
  var user;
  User.validatesPresenceOf('email', 'name');
  user = new User;
  test.ok(!user.isValid(), 'User is not valid');
  test.ok(user.errors.email, 'Attr email in errors');
  test.ok(user.errors.name, 'Attr name in errors');
  user.name = 'Alexey';
  test.ok(!user.isValid(), 'User is still not valid');
  test.ok(user.errors.email, 'Attr email still in errors');
  test.ok(!user.errors.name, 'Attr name valid');
  user.email = 'anatoliy@localhost';
  test.ok(user.isValid(), 'User is valid');
  test.ok(!user.errors, 'No errors');
  test.ok(!user.errors.email, 'Attr email valid');
  test.ok(!user.errors.name, 'Attr name valid');
  return test.done();
});

it('should allow to skip validations', function(test) {
  var user;
  User.validatesPresenceOf('pendingPeriod', {
    "if": 'createdByAdmin'
  });
  User.validatesLengthOf('domain', {
    is: 2,
    unless: 'createdByScript'
  });
  user = new User(validAttributes);
  test.ok(user.isValid());
  user.createdByAdmin = true;
  test.ok(!user.isValid());
  test.ok(user.errors.pendingPeriod.length);
  user.pendingPeriod = 1;
  test.ok(user.isValid());
  user.createdByScript = false;
  test.ok(!user.isValid());
  test.ok(user.errors.domain.length);
  user.domain = '12';
  test.ok(user.isValid());
  User.validatesLengthOf('domain', {
    is: 3,
    unless: function() {
      return this.domain !== 'xyz';
    }
  });
  test.ok(user.isValid());
  user.domain = 'xyz';
  test.ok(!user.isValid());
  return test.done();
});

it('should validate uniqueness', function(test) {
  var Airport, bkk;
  Airport = schema.define('Airport', {
    code: String,
    city: String
  });
  Airport.validatesUniquenessOf('code');
  bkk = new Airport({
    code: 'BKK',
    city: 'Bangkok'
  });
  return bkk.isValid(function(valid) {
    test.ok(valid);
    return bkk.updateAttribute('code', 'BKK', function() {
      var dmk;
      dmk = new Airport({
        code: 'DMK',
        city: 'Bangkok'
      });
      return dmk.isValid(function(valid) {
        test.ok(valid);
        return dmk.save(function() {
          return dmk.updateAttributes({
            city: 'Bangkok, Don Muang'
          }, function(err) {
            test.ok(!err);
            return dmk.save(function() {
              dmk.code = 'BKK';
              return dmk.isValid(function(valid) {
                test.ok(!valid);
                dmk.code = 'DMK';
                return dmk.isValid(function(valid) {
                  test.ok(valid);
                  return test.done();
                });
              });
            });
          });
        });
      });
    });
  });
});
