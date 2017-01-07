/**
 *  User Unit Test
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
 * Simple tests for the Article model
 */
describe(driver + ' - User unit:', function () {
    'use strict';
    var user, id, newUser = samples.users[0];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        done();
    });

    describe('create', function () {

        user = new User(newUser);
        it('user should be object', function () {
            user.should.be.type('object');
        });

        it('must be valid', function (done) {
            user.isValid(function (valid) {
                valid.should.be.true;
                if (!valid) console.log(user.errors);
                done();
            });
        });

    });

    describe('save', function () {

        it('should be have #save', function () {
            user.should.be.have.property('save');
            user.save.should.be.type('function');
        });

        it('must be saved', function (done) {
            user.save(function (err) {
                should.not.exist(err);
                user.should.be.have.property('id');
                user.id.should.not.eql(null);
                id = user.id;
                done();
            });
        });

    });

    describe('updateAttributes', function () {

        it('should be have #updateAttributes', function () {
            user.should.be.have.property('updateAttributes');
            user.updateAttributes.should.be.type('function');
        });

        it('must be updated', function (done) {
            user.updateAttributes({
                screen_name: 'bigboss'
            }, function (err) {
                should.not.exist(err);

                done();
            });
        });

    });

    describe('destroy', function () {

        it('should be have #destroy', function () {
            user.should.be.have.property('destroy');
            user.destroy.should.be.type('function');
        });

        it('must be destroyed', function (done) {
            user.destroy(function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

});
