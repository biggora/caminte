/**
 * Created by Alex on 12/18/2015.
 */
/*global
 describe, before, after, it
 */
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}
var driver = process.env.CAMINTE_DRIVER || 'sqlite';
var should = require('should');
var caminte = require('../../');
var config = require('./../lib/database');
var samples = require('./../lib/data');
var dbConf = config[driver];
var userModel = require('./../lib/User');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var User = userModel(schema);

describe(driver + ' - schema hooks:', function () {
    'use strict';
    var user, nuser, newUser = samples.users[0];

    before(function (done) {
        setTimeout(function(){
            schema.autoupdate(function () {
                return done && done();
            });
        }, 500);
    });

    after(function (done) {
        User.destroyAll(function(){
            return done && done();
        });
    });

    it("#afterInitialize", function (done) {
        User.afterInitialize = function () {
            User.afterInitialize = null;
            return done();
        };
        user = new User;
    });

    it("#beforeCreate", function (done) {
        User.beforeCreate = function () {
            User.beforeCreate = null;
            return done();
        };
        User.create(newUser, function (err) {
            should.not.exist(err);
        });
    });

    it("#afterCreate", function (done) {
        User.afterCreate = function () {
            User.afterCreate = null;
            return done();
        };
        newUser.email = 'bubles@example.org';
        User.create(newUser, function (err) {
            should.not.exist(err);
        });
    });

    it('#beforeSave', function (done) {
        User.beforeSave = function () {
            User.beforeSave = null;
            return done();
        };
        user = new User(newUser);
        user.email = 'bubles@example.mobi';
        user.save(function (err) {
            should.not.exist(err);
        });
    });

    it('#afterSave', function (done) {
        User.afterSave = function () {
            User.afterSave = null;
            return done();
        };
        nuser = new User(newUser);
        nuser.email = 'bubles@example.lv';
        nuser.save(function (err) {
            should.not.exist(err);
        });
    });

    it("#beforeUpdate", function (done) {
        User.beforeUpdate = function () {
            User.beforeUpdate = null;
            return done();
        };
        user.updateAttributes({
            email: "1@1.com"
        }, function (err) {
            should.not.exist(err);
        });
    });

    it("#afterUpdate", function (done) {
        User.afterUpdate = function () {
            User.afterUpdate = null;
            return done();
        };
        nuser.updateAttributes({
            email: "2@2.com"
        }, function (err) {
            should.not.exist(err);
        });
    });

    it("#beforeDestroy", function (done) {
        User.beforeDestroy = function () {
            User.beforeDestroy = null;
            return done();
        };
        user.destroy();
    });

    it("#afterDestroy", function (done) {
        User.afterDestroy = function () {
            User.afterDestroy = null;
            return done();
        };
        nuser.destroy();
    });

});
