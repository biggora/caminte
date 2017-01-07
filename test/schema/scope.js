/**
 *  Scope and Custom methods Test
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
// mocha test/schema/scope.js
/**
 * Simple tests for the Category model
 */
describe(driver + ' - schema scope:', function () {
    'use strict';
    var category, newCategory = samples.categories[0];

    before(function (done) {
        setTimeout(function(){
            category = new Category(newCategory);
            schema.autoupdate(function () {
                category.save(function () {
                    return done && done();
                });
            });
        }, 500);
    });

    after(function (done) {
        Category.destroyAll(function(){
            return done && done();
        });
    });

    describe('#scope', function () {

        it('#published', function (done) {
            Category.should.be.have.property('published');
            Category.scope.should.be.type('function');
            Category.published({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
        });

        it('#hidden', function (done) {
            Category.should.be.have.property('published');
            Category.scope.should.be.type('function');

            Category.hidden({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(1);
                done();
            });
        });

        it('#products', function (done) {
            Category.should.be.have.property('products');
            Category.scope.should.be.type('function');

            Category.products({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
        });
    });

});
