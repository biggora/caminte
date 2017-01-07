/**
 * Created by Alex on 12/27/2015.
 */
/*global
 describe, before, after, it
 */
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}
var driver = process.env.CAMINTE_DRIVER || 'sqlite';
var should = require('should');
var caminte = require('../../index');
var config = require('./../lib/database');
var samples = require('./../lib/data');
var dbConf = config[driver];
var categoryModel = require('./../lib/Category');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var Category = categoryModel(schema);

describe(driver + ' - queries:', function () {
    'use strict';
    var newCategories = samples.categories, total = newCategories.length;

    before(function (done) {
        setTimeout(function(){
            schema.autoupdate(function () {
                var cnt = newCategories.length;
                if (!cnt) {
                    return done && done();
                }
                newCategories.forEach(function (category) {
                    Category.create(category, function (err) {
                        if (err) {
                            console.log(err);
                        }
                        if (--cnt === 0) {
                            return done && done();
                        }
                    });
                });
            });
        }, 500);
    });

    after(function (done) {
        Category.destroyAll(function(){
            return done && done();
        });
    });

    describe('#order', function () {

        it('by category_id asc', function (done) {
            Category.all({
                order: 'category_id ASC'
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(total);
                var first = founds[0];
                var last = founds[total - 1];
                (first.category_id).should.be.below(last.category_id);
                done();
            });
        });

        it('by category_id desc', function (done) {
            Category.all({
                order: 'category_id DESC'
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(total);
                var first = founds[0];
                var last = founds[total - 1];
                (last.category_id).should.be.below(first.category_id);
                done();
            });
        });

    });

    describe('#skip', function () {

        it('must be 4 from ' + total, function (done) {
            Category.all({
                skip: 3,
                limit: 20
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(4);
                done();
            });
        });

    });

    describe('#limit', function () {

        it('must be 3 from ' + total, function (done) {
            Category.all({
                limit: 3
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(3);
                done();
            });
        });

    });

    describe('#where', function () {

        it('# = - must be equal 2', function (done) {
            Category.all({
                where: {
                    category_id : 2
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(3);
                done();
            });
        });

        it('#ne - must be not equal 2', function (done) {
            Category.all({
                where: {
                    category_id : { ne : 2 }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(4);
                done();
            });
        });

        it('#lt - must be less then 2', function (done) {
            Category.all({
                where: {
                    category_id : { lt : 2 }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(3);
                done();
            });
        });

        it('#lte - must be less then or equal 2', function (done) {
            Category.all({
                where: {
                    category_id : { lte : 2 }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(6);
                done();
            });
        });

        it('#gt - must be greater than 2', function (done) {
            Category.all({
                where: {
                    category_id : { gt : 2 }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(1);
                done();
            });
        });

        it('#gte - must be greater then or equal 2', function (done) {
            Category.all({
                where: {
                    category_id : { gte : 2 }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(4);
                done();
            });
        });

        it('#between - must be between [1,3]', function (done) {
            Category.all({
                where: {
                    category_id : { between : [1,3] }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(6);
                done();
            });
        });

        it('#inq - must be in [1,3]', function (done) {
            Category.all({
                where: {
                    category_id : { inq : [1,3] }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(3);
                done();
            });
        });

        it('#inq - must be in [ru,lv]', function (done) {
            Category.all({
                where: {
                    language : { inq : ['ru','lv'] }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(5);
                done();
            });
        });

        it('#nin - must be not in [1,3]', function (done) {
            Category.all({
                where: {
                    category_id : { nin : [1,3] }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(4);
                done();
            });
        });

        it('#nin - must be not in [en,lv]', function (done) {
            Category.all({
                where: {
                    language : { nin : ['en','lv'] }
                }
            }, function (err, founds) {
                should.not.exist(err);
                founds.should.length(4);
                done();
            });
        });
    });

});
