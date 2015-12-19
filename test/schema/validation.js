/**
 *  Validation Test
 *  Created by caminte-cli script
 **/

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}

var driver = process.env.CAMINTE_DRIVER || 'sqlite';
var should = require('should');
var caminte = require('../../');
var config = require('./../lib/database');
var dbConf = config[driver];
var UserModel = require('./../lib/User');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var User = UserModel(schema);

/**
 * Simple tests for the User model
 */
describe(driver + ' - validation:', function () {
    'use strict';
    var suser, user, newUser = {
        language: 'en',
        first_name: 'Alex',
        last_name: 'Gordan',
        screen_name: 'alex',
        email: 'rubles@example.com',
        password: 'AAAAAAAAA',
        age: 45
    }, email = 'bubles@example.com';

    before(function (done) {
        user = new User(newUser);
        suser = new User(newUser);
        schema.autoupdate(function(){
            suser.email = email;
            suser.save(done);
        });
    });

    after(function (done) {
        User.destroyAll(done);
    });

    describe('#validatesPresenceOf', function () {

        it('invalid', function (done) {
            user.first_name = null;
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.first_name = 'Alex';
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesInclusionOf', function () {

        it('invalid', function (done) {
            user.language = 'by';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.language = 'ru';
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });
    });

    describe('#validatesLengthOf', function () {

        it('invalid', function (done) {
            user.password = 'xx';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.password = 'AAAAAAAAA';
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesNumericalityOf', function () {

        it('invalid', function (done) {
            user.age = 'xx';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.age = 45;
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesExclusionOf', function () {

        it('invalid', function (done) {
            user.screen_name = 'admin';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.screen_name = 'boss';
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesFormatOf', function () {

        it('invalid', function (done) {
            user.screen_name = 'red in';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.screen_name = 'hugoboss';
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

    describe('#validatesUniquenessOf', function () {

        it('invalid', function (done) {
            user.email = email;
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.email = newUser.email;
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });


    describe('#validate', function () {

        it('invalid', function (done) {
            user.email = 'hg hj h';
            user.isValid(function (valid) {
                valid.should.be.false;
                done();
            });
        });

        it('valid', function (done) {
            user.email = newUser.email;
            user.isValid(function (valid) {
                valid.should.be.true;
                done();
            });
        });

    });

});