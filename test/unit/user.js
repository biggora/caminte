/**
 *  User Unit Test
 *  Created by caminte-cli script
 **/

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}
var driver = process.env.CAMINTE_DRIVER || 'memory';
var should = require('should');
var caminte = require('caminte');
var config = require('./../lib/database');
var dbConf = config[driver];
var UserModel = require('./../lib/User');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var User = UserModel(schema);

/**
 * Simple tests for the Article model
 */
describe(driver + ' - User unit:', function () {
    'use strict';
    var user, id;

    before(function (done) {
        schema.autoupdate(done);
    });

    after(function (done) {
        done();
    });

    describe('create', function () {

        user = new User();
        it('user should be object', function () {
            user.should.be.type('object');
        });

        it('validate', function (done) {
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

        it('call', function (done) {
            user.save(function (err) {
                should.not.exist(err);
                user.should.be.have.property('id');
                user.id.should.not.eql(null);
                id = user.id;
                done();
            });
        });

    });

    describe('destroy', function () {

        it('should be have #destroy', function () {
            user.should.be.have.property('destroy');
            user.destroy.should.be.type('function');
        });

        it('call', function (done) {
            user.destroy(function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

});