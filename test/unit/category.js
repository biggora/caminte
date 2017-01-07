/**
 *  Category Unit Test
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
var categoryModel = require('./../lib/Category');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Category = categoryModel(schema);

/**
 * Simple tests for the Article model
 */
describe(driver + ' - Category unit:', function () {
    'use strict';
    var category, id, newCategory = samples.categories[0];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        done();
    });

    describe('create', function () {

        category = new Category(newCategory);
        it('category should be object', function () {
            category.should.be.type('object');
        });

        it('must be valid', function (done) {
            category.isValid(function (valid) {
                valid.should.be.true;
                if (!valid) console.log(category.errors);
                done();
            });
        });

    });

    describe('save', function () {

        it('should be have #save', function () {
            category.should.be.have.property('save');
            category.save.should.be.type('function');
        });

        it('must be saved', function (done) {
            category.save(function (err) {
                should.not.exist(err);
                category.should.be.have.property('id');
                category.id.should.not.eql(null);
                id = category.id;
                done();
            });
        });

    });

    describe('updateAttributes', function () {

        it('should be have #updateAttributes', function () {
            category.should.be.have.property('updateAttributes');
            category.updateAttributes.should.be.type('function');
        });

        it('must be updated', function (done) {
            category.updateAttributes({
                title: 'test 2'
            }, function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

    describe('destroy', function () {

        it('should be have #destroy', function () {
            category.should.be.have.property('destroy');
            category.destroy.should.be.type('function');
        });

        it('must be destroyed', function (done) {
            category.destroy(function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

});
