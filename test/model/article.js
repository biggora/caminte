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

describe(driver + ' - Article model:', function () {
    'use strict';
    var id, newArticle = samples.articles[1];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        Article.destroyAll(function(){
            return done && done();
        });
    });

    it('#create', function (done) {
        Article.create(newArticle, function (err, created) {
            should.not.exist(err);
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
        Article.exists(id, function (err, exists) {
            should.not.exist(err);
            exists.should.be.true;
            done();
        });
    });

    it('#findById', function (done) {
        Article.findById(id, function (err, found) {
            should.not.exist(err);
            found.id.should.deepEqual(id);
            done();
        });
    });

    it('#findOne', function (done) {
        Article.findOne({
            where: {
                alias: newArticle.alias
            }
        }, function (err, found) {
            should.not.exist(err);
            should.deepEqual(found.id, id);
            found.alias.should.eql(newArticle.alias);
            done();
        });
    });

    it('#find', function (done) {
        Article.find({}, function (err, founds) {
            should.not.exist(err);
            founds.should.length(1);
            done();
        });
    });

    it('#all', function (done) {
        Article.all({}, function (err, founds) {
            should.not.exist(err);
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
        }, function (err, affected) {
            should.not.exist(err);
            should.exist(affected);
            Article.findById(id, function (err, found) {
                should.not.exist(err);
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
        }, function (err, created) {
            should.not.exist(err);
            should.exist(created);
            Article.all({
                where: {
                    title: 'Article_3'
                }
            }, function (err, founds) {
                should.not.exist(err);
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
        }, function (err, updated) {
            should.not.exist(err);
            should.exist(updated);
            Article.all({
                where: {
                    alias: 'my-article-4'
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(1);
                done();
            });
        });
    });

    it('#count', function (done) {
        Article.count({}, function (err, count) {
            should.not.exist(err);
            count.should.equal(2);
            done();
        });
    });

    it('#destroyById', function (done) {
        Article.destroyById(id, function (err) {
            should.not.exist(err);
            Article.findById(id, function (err, found) {
                should.not.exist(err);
                should.not.exist(found);
                done();
            });
        });
    });

    it('#destroyAll', function (done) {
        Article.destroyAll(function (err) {
            should.not.exist(err);
            Article.find({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
        });
    });


    /*
     describe('properties methods:', function () {

     it('#toString', function () {
     Article.should.be.have.property('toString');
     Article.toString.should.be.type('function');
     });

     it('#forEachProperty', function () {
     Article.should.be.have.property('forEachProperty');
     Article.forEachProperty.should.be.type('function');
     });

     it('#registerProperty', function () {
     Article.should.be.have.property('registerProperty');
     Article.registerProperty.should.be.type('function');
     });

     });

     describe('scope methods:', function () {

     it('#scope', function () {
     Article.should.be.have.property('scope');
     Article.scope.should.be.type('function');
     });

     });

     describe('query methods:', function () {

     it('#create', function () {
     Article.should.be.have.property('create');
     Article.create.should.be.type('function');
     });

     it('#exists', function () {
     Article.should.be.have.property('exists');
     Article.exists.should.be.type('function');
     });

     it('#count', function () {
     Article.should.be.have.property('count');
     Article.count.should.be.type('function');
     });

     it('#findOrCreate', function () {
     Article.should.be.have.property('findOrCreate');
     Article.findOrCreate.should.be.type('function');
     });

     it('#findById', function () {
     Article.should.be.have.property('findById');
     Article.findById.should.be.type('function');
     });

     it('#findOne', function () {
     Article.should.be.have.property('findOne');
     Article.findOne.should.be.type('function');
     });

     it('#find', function () {
     Article.should.be.have.property('find');
     Article.find.should.be.type('function');
     });

     it('#all', function () {
     Article.should.be.have.property('all');
     Article.all.should.be.type('function');
     });

     it('#run', function () {
     Article.should.be.have.property('run');
     Article.run.should.be.type('function');
     });

     it('#exec', function () {
     Article.should.be.have.property('exec');
     Article.exec.should.be.type('function');
     });

     it('#update', function () {
     Article.should.be.have.property('update');
     Article.update.should.be.type('function');
     });

     it('#updateOrCreate', function () {
     Article.should.be.have.property('updateOrCreate');
     Article.updateOrCreate.should.be.type('function');
     });

     it('#upsert', function () {
     Article.should.be.have.property('upsert');
     Article.upsert.should.be.type('function');
     });

     it('#destroyAll', function () {
     Article.should.be.have.property('destroyAll');
     Article.destroyAll.should.be.type('function');
     });

     it('#destroyById', function () {
     Article.should.be.have.property('destroyById');
     Article.destroyById.should.be.type('function');
     });

     it('#remove', function () {
     Article.should.be.have.property('remove');
     Article.remove.should.be.type('function');
     });

     });

     describe('relations methods:', function () {
     it('#hasMany', function () {
     Article.should.be.have.property('hasMany');
     Article.hasMany.should.be.type('function');
     });
     it('#belongsTo', function () {
     Article.should.be.have.property('belongsTo');
     Article.hasMany.should.be.type('function');
     });
     });

     describe('validations methods:', function () {

     it('#validate', function () {
     Article.should.be.have.property('validate');
     Article.validate.should.be.type('function');
     });

     it('#validatesPresenceOf', function () {
     Article.should.be.have.property('validatesPresenceOf');
     Article.validatesPresenceOf.should.be.type('function');
     });

     it('#validatesLengthOf', function () {
     Article.should.be.have.property('validatesLengthOf');
     Article.validatesLengthOf.should.be.type('function');
     });

     it('#validatesNumericalityOf', function () {
     Article.should.be.have.property('validatesNumericalityOf');
     Article.validatesNumericalityOf.should.be.type('function');
     });

     it('#validatesInclusionOf', function () {
     Article.should.be.have.property('validatesInclusionOf');
     Article.validatesInclusionOf.should.be.type('function');
     });

     it('#validatesInclusionOf', function () {
     Article.should.be.have.property('validatesInclusionOf');
     Article.validatesInclusionOf.should.be.type('function');
     });

     it('#validatesFormatOf', function () {
     Article.should.be.have.property('validatesFormatOf');
     Article.validatesFormatOf.should.be.type('function');
     });

     it('#validatesUniquenessOf', function () {
     Article.should.be.have.property('validatesUniquenessOf');
     Article.validatesUniquenessOf.should.be.type('function');
     });

     it('#validateAsync', function () {
     Article.should.be.have.property('validateAsync');
     Article.validateAsync.should.be.type('function');
     });

     });

     describe('hook methods:', function () {

     it('#afterInitialize', function () {
     Article.should.be.have.property('afterInitialize');
     // Article.afterInitialize.should.be.type('function');
     });

     it('#beforeValidation', function () {
     Article.should.be.have.property('beforeValidation');
     // Article.afterInitialize.should.be.type('function');
     });

     it('#afterValidation', function () {
     Article.should.be.have.property('afterValidation');
     });

     it('#beforeSave', function () {
     Article.should.be.have.property('beforeSave');
     });

     it('#afterSave', function () {
     Article.should.be.have.property('afterSave');
     });

     it('#beforeCreate', function () {
     Article.should.be.have.property('beforeCreate');
     });

     it('#afterCreate', function () {
     Article.should.be.have.property('afterCreate');
     });

     it('#beforeUpdate', function () {
     Article.should.be.have.property('beforeUpdate');
     });

     it('#afterUpdate', function () {
     Article.should.be.have.property('afterUpdate');
     });

     it('#beforeDestroy', function () {
     Article.should.be.have.property('beforeDestroy');
     });

     it('#afterDestroy', function () {
     Article.should.be.have.property('afterDestroy');
     });
     });
     */
});
