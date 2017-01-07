/**
 *  Article Unit Test
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
var articleModel = require('./../lib/Article');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Article = articleModel(schema);

/**
 * Simple tests for the Article model
 */
describe(driver + ' - Article unit:', function () {
    'use strict';
    var article, id, newArticle = samples.articles[0];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        done();
    });

    describe('create unit with initial data', function () {

        it('unit should be created', function () {
            article = new Article(newArticle);
            article.should.be.type('object');
            article.active.should.eql(newArticle.active);
            article.language.should.eql(newArticle.language);
            article.category_id.should.eql(newArticle.category_id);
            article.title.should.eql(newArticle.title);
            article.alias.should.eql(newArticle.alias);
            article.mainpage.should.eql(newArticle.mainpage);
        });

    });

    describe('validate created unit', function () {

        it('unit must be valid', function (done) {
            article.isValid(function (valid) {
                valid.should.be.true;
                if (!valid) console.log(article.errors);
                done();
            });
        });

    });

    describe('save unit', function () {

        it('unit should be have #save method', function () {
            article.should.be.have.property('save');
            article.save.should.be.type('function');
        });

        it('unit must be saved', function (done) {
            article.save(function (err) {
                should.not.exist(err);
                article.should.be.have.property('id');
                article.id.should.not.eql(null);
                id = article.id;
                done();
            });
        });

    });

    describe('update unit attributes', function () {

        it('unit should be have #updateAttributes method', function () {
            article.should.be.have.property('updateAttributes');
            article.updateAttributes.should.be.type('function');
        });

        it('unit must be updated', function (done) {
            article.updateAttributes({
                title: 'test 2'
            }, function (err) {
                should.not.exist(err);

                done();
            });
        });

    });

    describe('destroy unit', function () {

        it('unit should be have #destroy method', function () {
            article.should.be.have.property('destroy');
            article.destroy.should.be.type('function');
        });

        it('unit must be destroyed', function (done) {
            article.destroy(function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

});
