/**
 *  Category Integration Test
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

describe(driver + ' - Category model:', function () {
    'use strict';
    var id, newCategory = samples.categories[0];

    before(function (done) {
        schema.autoupdate(function(){
            return done && done();
        });
    });

    after(function (done) {
        Category.destroyAll(done);
    });

    it('#create', function (done) {
        Category.create(newCategory, function (err, created) {
            should.not.exist(err);
            created.should.be.have.property('id');
            created.id.should.not.eql(null);
            created.category_id.should.eql(newCategory.category_id);
            created.section.should.eql(newCategory.section);
            created.title.should.eql(newCategory.title);
            id = created.id;
            done();
        });
    });

    it('#exists', function (done) {
        Category.exists(id, function (err, exists) {
            should.not.exist(err);
            exists.should.be.true;
            done();
        });
    });

    it('#findById', function (done) {
        Category.findById(id, function (err, found) {
            should.not.exist(err);
            found.id.should.deepEqual(id);
            done();
        });
    });

    it('#findOne', function (done) {
        Category.findOne({
            where: {
                section: newCategory.section
            }
        }, function (err, found) {
            should.not.exist(err);
            should.deepEqual(found.id, id);
            found.section.should.eql(newCategory.section);
            found.title.should.eql(newCategory.title);
            done();
        });
    });

    it('#find', function (done) {
        Category.find({}, function (err, founds) {
            should.not.exist(err);
            founds.should.length(1);
            done();
        });
    });

    it('#all', function (done) {
        Category.all({}, function (err, founds) {
            should.not.exist(err);
            founds.should.length(1);
            done();
        });
    });

    it('#count', function (done) {
        Category.count({}, function (err, count) {
            should.not.exist(err);
            count.should.equal(1);
            done();
        });
    });

    it('#destroyById', function (done) {
        Category.destroyById(id, function (err) {
            should.not.exist(err);
            Category.findById(id, function (err, found) {
                should.not.exist(err);
                should.not.exist(found);
                done();
            });
        });
    });

    it('#destroyAll', function (done) {
        Category.destroyAll(function (err) {
            should.not.exist(err);
            Category.find({}, function (err, founds) {
                should.not.exist(err);
                founds.should.length(0);
                done();
            });
        });
    });
/*
    describe('properties methods:', function () {

        it('#toString', function () {
            Category.should.be.have.property('toString');
            Category.toString.should.be.type('function');
        });

        it('#forEachProperty', function () {
            Category.should.be.have.property('forEachProperty');
            Category.forEachProperty.should.be.type('function');
        });

        it('#registerProperty', function () {
            Category.should.be.have.property('registerProperty');
            Category.registerProperty.should.be.type('function');
        });

    });

    describe('scope methods:', function () {

        it('#scope', function () {
            Category.should.be.have.property('scope');
            Category.scope.should.be.type('function');
        });

    });

    describe('query methods:', function () {

        it('#create', function () {
            Category.should.be.have.property('create');
            Category.create.should.be.type('function');
        });

        it('#exists', function () {
            Category.should.be.have.property('exists');
            Category.exists.should.be.type('function');
        });

        it('#count', function () {
            Category.should.be.have.property('count');
            Category.count.should.be.type('function');
        });

        it('#findOrCreate', function () {
            Category.should.be.have.property('findOrCreate');
            Category.findOrCreate.should.be.type('function');
        });

        it('#findById', function () {
            Category.should.be.have.property('findById');
            Category.findById.should.be.type('function');
        });

        it('#findOne', function () {
            Category.should.be.have.property('findOne');
            Category.findOne.should.be.type('function');
        });

        it('#find', function () {
            Category.should.be.have.property('find');
            Category.find.should.be.type('function');
        });

        it('#all', function () {
            Category.should.be.have.property('all');
            Category.all.should.be.type('function');
        });

        it('#run', function () {
            Category.should.be.have.property('run');
            Category.run.should.be.type('function');
        });

        it('#exec', function () {
            Category.should.be.have.property('exec');
            Category.exec.should.be.type('function');
        });

        it('#update', function () {
            Category.should.be.have.property('update');
            Category.update.should.be.type('function');
        });

        it('#updateOrCreate', function () {
            Category.should.be.have.property('updateOrCreate');
            Category.updateOrCreate.should.be.type('function');
        });

        it('#upsert', function () {
            Category.should.be.have.property('upsert');
            Category.upsert.should.be.type('function');
        });

        it('#destroyAll', function () {
            Category.should.be.have.property('destroyAll');
            Category.destroyAll.should.be.type('function');
        });

        it('#destroyById', function () {
            Category.should.be.have.property('destroyById');
            Category.destroyById.should.be.type('function');
        });

        it('#remove', function () {
            Category.should.be.have.property('remove');
            Category.remove.should.be.type('function');
        });

    });

    describe('relations methods:', function () {
        it('#hasMany', function () {
            Category.should.be.have.property('hasMany');
            Category.hasMany.should.be.type('function');
        });
        it('#belongsTo', function () {
            Category.should.be.have.property('belongsTo');
            Category.hasMany.should.be.type('function');
        });
    });

    describe('validations methods:', function () {

        it('#validate', function () {
            Category.should.be.have.property('validate');
            Category.validate.should.be.type('function');
        });

        it('#validatesPresenceOf', function () {
            Category.should.be.have.property('validatesPresenceOf');
            Category.validatesPresenceOf.should.be.type('function');
        });

        it('#validatesLengthOf', function () {
            Category.should.be.have.property('validatesLengthOf');
            Category.validatesLengthOf.should.be.type('function');
        });

        it('#validatesNumericalityOf', function () {
            Category.should.be.have.property('validatesNumericalityOf');
            Category.validatesNumericalityOf.should.be.type('function');
        });

        it('#validatesInclusionOf', function () {
            Category.should.be.have.property('validatesInclusionOf');
            Category.validatesInclusionOf.should.be.type('function');
        });

        it('#validatesInclusionOf', function () {
            Category.should.be.have.property('validatesInclusionOf');
            Category.validatesInclusionOf.should.be.type('function');
        });

        it('#validatesFormatOf', function () {
            Category.should.be.have.property('validatesFormatOf');
            Category.validatesFormatOf.should.be.type('function');
        });

        it('#validatesUniquenessOf', function () {
            Category.should.be.have.property('validatesUniquenessOf');
            Category.validatesUniquenessOf.should.be.type('function');
        });

        it('#validateAsync', function () {
            Category.should.be.have.property('validateAsync');
            Category.validateAsync.should.be.type('function');
        });

    });

    describe('hook methods:', function () {

        it('#afterInitialize', function () {
            Category.should.be.have.property('afterInitialize');
            // Category.afterInitialize.should.be.type('function');
        });

        it('#beforeValidation', function () {
            Category.should.be.have.property('beforeValidation');
            // Category.afterInitialize.should.be.type('function');
        });

        it('#afterValidation', function () {
            Category.should.be.have.property('afterValidation');
        });

        it('#beforeSave', function () {
            Category.should.be.have.property('beforeSave');
        });

        it('#afterSave', function () {
            Category.should.be.have.property('afterSave');
        });

        it('#beforeCreate', function () {
            Category.should.be.have.property('beforeCreate');
        });

        it('#afterCreate', function () {
            Category.should.be.have.property('afterCreate');
        });

        it('#beforeUpdate', function () {
            Category.should.be.have.property('beforeUpdate');
        });

        it('#afterUpdate', function () {
            Category.should.be.have.property('afterUpdate');
        });

        it('#beforeDestroy', function () {
            Category.should.be.have.property('beforeDestroy');
        });

        it('#afterDestroy', function () {
            Category.should.be.have.property('afterDestroy');
        });
    });
*/
});
