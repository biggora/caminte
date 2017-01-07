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
var articleModel = require('./../lib/Article');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Article = articleModel(schema);

describe(driver + ' - schema types:', function () {
    'use strict';
    var id, article, newArticle = samples.articles[1];

    before(function (done) {
        setTimeout(function(){
            schema.autoupdate(function () {
                Article.create(newArticle, function (err, created) {
                    id = created.id;
                    Article.findById(id, function (err, found) {
                        article = found;
                        return done && done();
                    });
                });
            });
        }, 500);
    });

    after(function (done) {
        Article.destroyAll(done);
    });

    it("must be a String", function () {
        article.language.should.be.String;
    });

    it("must be a Text", function () {
        article.content_short.should.be.String;
        // article.content_short.should.be.length();
    });

    it("must be a Boolean", function () {
        article.featured.should.be.Boolean;
    });

    it("must be a Number", function () {
        article.active.should.be.Number;
    });

    it("must be a Double", function () {
        article.longitude.should.be.Double;
    });

    it("must be a Float", function () {
        article.longitude.should.be.Float;
    });

    it("must be a Real", function () {
        article.latitude.should.be.Double;
    });

    it("must be a Date", function () {
        article.create_ts.should.be.Object;
        article.create_ts.toISOString.should.be.Function;
    });

    describe('json type', function () {
        it("must be Object", function () {
            article.params.should.be.Object;
            article.params.should.be.have.property('title');
        });
        it("must be Array", function () {
            article.meta_keys.should.be.Array;
        });
    });

});
