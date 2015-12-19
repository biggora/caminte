/**
 *  Scope and Custom methods Test
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
var CategoryModel = require('./../lib/Category');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Category = CategoryModel(schema);
// mocha test/schema/scope.js
/**
 * Simple tests for the Category model
 */
describe(driver + ' - scope:', function () {
    'use strict';
    var category, newCategory = {
        category_id: 2,
        title: 'My Category',
        section: 'my-category'
    };

    before(function (done) {
        category = new Category(newCategory);
        schema.autoupdate(function () {
            category.save(done);
        });
    });

    after(function (done) {
        Category.destroyAll(done);
    });

    describe('#scope', function () {

        it('#published', function (done) {
           // Category.should.be.have.property('published');
           // Category.scope.should.be.type('function');
            /*
            Category.published(function(err, founds){
                should.not.exist(err);
                founds.should.length(1);
                done();
            });
            */
            done();
        });

        it('#hidden', function (done) {
            // Category.should.be.have.property('published');
            // Category.scope.should.be.type('function');
            /*
            Category.hidden(function(err, founds){
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
            */
            done();
        });

    });

});