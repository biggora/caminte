/**
 *  Article Unit Test
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
var ArticleModel = require('./../lib/Article');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Article = ArticleModel(schema);

/**
 * Simple tests for the Article model
 */
describe(driver + ' - Article unit:', function () {
    'use strict';
    var article, id, newArticle = {
        title: 'test 1',
        alias: 'test-1'
    };

    before(function (done) {
        schema.autoupdate(done);
    });

    after(function (done) {
        Article.destroyAll(done);
    });

    describe('create', function () {

        article = new Article(newArticle);
        it('article should be object', function () {
            article.should.be.type('object');
        });

    });

    describe('isValid', function () {

        it('validated', function (done) {
            article.isValid(function (valid) {
                valid.should.be.true;
                if (!valid) console.log(article.errors);
                done();
            });
        });

    });

    describe('save', function () {

        it('should be have #save', function () {
            article.should.be.have.property('save');
            article.save.should.be.type('function');
        });

        it('call', function (done) {
            article.save(function (err) {
                should.not.exist(err);
                article.should.be.have.property('id');
                article.id.should.not.eql(null);
                id = article.id;
                done();
            });
        });

    });

    describe('updateAttributes', function () {

        it('should be have #updateAttributes', function () {
            article.should.be.have.property('updateAttributes');
            article.updateAttributes.should.be.type('function');
        });

        it('call', function (done) {
            article.updateAttributes({
                title: 'test 2'
            }, function (err) {
                should.not.exist(err);

                done();
            });
        });

    });

    describe('destroy', function () {

        it('should be have #destroy', function () {
            article.should.be.have.property('destroy');
            article.destroy.should.be.type('function');
        });

        it('call', function (done) {
            article.destroy(function (err) {
                should.not.exist(err);
                done();
            });
        });

    });

});