/**
 *  Validation Test
 *  Created by caminte-cli script
 **/
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

/**
 * Simple tests for the User model
 */
describe(driver + ' - schema validation:', function () {
    'use strict';
    var user1, user2,
        newUser1 = samples.users[0],
        newUser2 = samples.users[0];

    before(function (done) {
        setTimeout(function(){
            user1 = new User(newUser1);
            user2 = new User(newUser2);
            schema.autoupdate(function () {
                user1.save(done);
            });
        }, 500);
    });

    after(function (done) {
        User.destroyAll(done);
    });

    describe('#validatesPresenceOf', function () {

        it('must be invalid', function (done) {
            user1.first_name = null;
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.first_name = 'Alex';
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesInclusionOf', function () {

        it('must be invalid', function (done) {
            user1.language = 'by';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.language = 'ru';
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });
    });

    describe('#validatesLengthOf', function () {

        it('must be invalid', function (done) {
            user1.password = 'xx';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.password = 'AAAAAAAAA';
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesNumericalityOf', function () {

        it('must be invalid', function (done) {
            user1.age = 'xx';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.age = 45;
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesExclusionOf', function () {

        it('must be invalid', function (done) {
            user1.screen_name = 'admin';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.screen_name = 'boss';
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesFormatOf', function () {

        it('must be invalid', function (done) {
            user1.screen_name = 'red in';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.screen_name = 'hugoboss';
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesUniquenessOf', function () {

        it('must be invalid', function (done) {
            user1.email = newUser2.email;
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.email = newUser1.email;
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validate', function () {

        it('must be invalid', function (done) {
            user1.email = 'hg hj h';
            user1.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('must be valid', function (done) {
            user1.email = newUser1.email;
            user1.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

});
