var AbstractClass, Hookable, Schema, User, caminte, schema;

caminte = require('../index');
Schema = caminte.Schema;
AbstractClass = caminte.AbstractClass;
Hookable = caminte.Hookable;
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
    createdByAdmin: Boolean
});

it("should trigger after initialize", function (test) {
    var user;
    User.afterInitialize = function () {
        User.afterInitialize = null;
        return test.done();
    };
    return user = new User;
});

it("should trigger before create", function (test) {
    User.beforeCreate = function () {
        User.beforeCreate = null;
        return test.done();
    };
    return User.create(function () {
        return test.ok("saved");
    });
});

it("should trigger after create", function (test) {
    User.afterCreate = function (next) {
        User.afterCreate = null;
        return next();
    };
    return User.create(function () {
        test.ok("saved");
        return test.done();
    });
});

it('should trigger before save', function (test) {
    var user;
    test.expect(3);
    User.beforeSave = function (next) {
        User.beforeSave = null;
        this.name = 'mr. ' + this.name;
        return next();
    };
    user = new User({
        name: 'Jonathan'
    });
    return user.save(function () {
        test.equals(User.schema.adapter.cache.User[user.id].name, user.name);
        test.equals(user.name, 'mr. Jonathan');
        test.ok('saved');
        return test.done();
    });
});

it('should trigger after save', function (test) {
    var user;
    User.afterSave = function (next) {
        User.afterSave = null;
        return next();
    };
    user = new User;
    return user.save(function () {
        test.ok("saved");
        return test.done();
    });
});

it("should trigger before update", function (test) {
    User.beforeUpdate = function () {
        User.beforeUpdate = null;
        return test.done();
    };
    return User.create({}, function (err, user) {
        return user.updateAttributes({
            email: "1@1.com"
        }, function () {
            return test.ok("updated");
        });
    });
});

it("should trigger after update", function (test) {
    User.afterUpdate = function () {
        User.afterUpdate = null;
        return test.done();
    };
    return User.create(function (err, user) {
        return user.updateAttributes({
            email: "1@1.com"
        }, function () {
            return test.ok("updated");
        });
    });
});

it("should trigger before destroy", function (test) {
    User.beforeDestroy = function () {
        User.beforeDestroy = null;
        return test.done();
    };
    return User.create({}, function (err, user) {
        return user.destroy();
    });
});

it("should trigger after destroy", function (test) {
    User.afterDestroy = function () {
        User.afterDestroy = null;
        return test.done();
    };
    return User.create(function (err, user) {
        return user.destroy();
    });
});

it('allows me to modify attributes before saving', function (test) {
    return test.done();
});
