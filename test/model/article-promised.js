/**
 *  Article Integration Test
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

describe(driver + ' - Promised Article model:', function () {
    'use strict';
    var id, newArticle = samples.articles[1];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        Article.destroyAll(done);
    });

    it('#create', function (done) {
        Article.create(newArticle).then(function (created) {
            // should.not.exist(err);
            created.should.be.have.property('id');
            created.id.should.not.eql(null);
            created.category_id.should.eql(1);
            created.alias.should.eql(newArticle.alias);
            created.title.should.eql(newArticle.title);
            created.language.should.eql(newArticle.language);
            id = created.id;
            done();
        });
    });

    it('#exists', function (done) {
        Article.exists(id).then(function (exists) {
            // should.not.exist(err);
            exists.should.be.true;
            done();
        });
    });

    it('#findById', function (done) {
        Article.findById(id).then(function (found) {
            // should.not.exist(err);
            found.id.should.deepEqual(id);
            done();
        });
    });

    it('#findOne', function (done) {
        Article.findOne({
            where: {
                alias: newArticle.alias
            }
        }).then(function (found) {
            // should.not.exist(err);
            should.deepEqual(found.id, id);
            found.alias.should.eql(newArticle.alias);
            done();
        });
    });

    it('#find', function (done) {
        Article.find({where:{}}).then(function (founds) {
            // should.not.exist(err);
            founds.should.length(1);
            done();
        });
    });

    it('#all', function (done) {
        Article.all({where:{}}).then(function (founds) {
            // should.not.exist(err);
            founds.should.length(1);
            done();
        });
    });

    it('#update', function (done) {
        var title = 'Article_2';
        Article.update({
            alias: newArticle.alias
        }, {
            title: title,
            mainpage: 1
        }).then(function(affected){
            should.exist(affected);
            Article.findById(id).then(function (found) {
                // should.not.exist(err);
                should.exist(found);
                found.alias.should.be.equal(newArticle.alias);
                found.title.should.be.exactly(title);
                found.mainpage.should.eql(1);
                done();
            });
        });
    });

    it('#findOrCreate', function (done) {
        Article.findOrCreate({
            title: 'Article_3'
        }, {
            language: 'ru',
            category_id: 2,
            alias: 'my-article-3',
            mainpage: 0
        }).then(function (created) {
            // should.not.exist(err);
            should.exist(created);
            Article.all({
                where: {
                    title: 'Article_3'
                }
            }).then(function (founds) {
                // should.not.exist(err);
                founds.should.length(1);
                done();
            });
        });
    });

    it('#updateOrCreate', function (done) {
        Article.updateOrCreate({
            title: 'Article_3'
        }, {
            alias: 'my-article-4',
            mainpage: 1
        }).then(function (updated) {
            // should.not.exist(err);
            should.exist(updated);
            Article.all({
                where: {
                    alias: 'my-article-4'
                }
            }).then(function (founds) {
                // should.not.exist(err);
                founds.should.length(1);
                done();
            });
        });
    });

    it('#count', function (done) {
        Article.count({}).then(function (count) {
            // should.not.exist(err);
            count.should.equal(2);
            done();
        });
    });

    it('#destroyById', function (done) {
        Article.destroyById(id).then(function (err) {
            should.not.exist(err);
            Article.findById(id, function (err, found) {
                should.not.exist(err);
                should.not.exist(found);
                done();
            });
        });
    });

    it('#destroyAll', function (done) {
        Article.destroyAll().then(function (err) {
            should.not.exist(err);
            Article.find({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
        });
    });

});
