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
var userModel = require('./../lib/User');
var articleModel = require('./../lib/Article');
var Schema = caminte.Schema;
dbConf.host = process.env.DB_HOST || dbConf.host || '';
var schema = new Schema(dbConf.driver, dbConf);
var User = userModel(schema);
var Article = articleModel(schema);

/**
 * Simple tests for the User and Article model
 */
describe(driver + ' - relation:', function () {
    'use strict';
    var article, user, newUser = samples.users[0], newArticle = samples.articles[0];

    User.hasMany(Article, {as: 'articles', foreignKey: 'create_id'});
    Article.belongsTo(User, {as: 'author', foreignKey: 'create_id'});

    before(function (done) {
        setTimeout(function(){
            schema.autoupdate(function () {
                user = new User(newUser);
                user.save(function () {
                    return done && done();
                });
            });
        }, 500);
    });

    after(function (done) {
        User.destroyAll(function () {
            Article.destroyAll(function(){
                return done && done();
            });
        });
    });

    describe('#hasMany', function () {

        it('#build', function (done) {
            article = user.articles.build(newArticle);
            should.exist(article);
            article.alias.should.be.equal(newArticle.alias);
            article.title.should.be.exactly(newArticle.title);
            should.deepEqual(article.create_id.toString(), user.id.toString());
            done();
        });

        it('#create', function (done) {
            user.articles.create(newArticle, function (err, created) {
                should.not.exist(err);
                should.exist(created);
                created.alias.should.be.equal(newArticle.alias);
                created.title.should.be.exactly(newArticle.title);
                should.deepEqual(created.create_id.toString(), user.id.toString());
                done();
            });
        });

        it('#get (articles)', function (done) {
            user.articles(function (err, founds) {
                should.not.exist(err);
                founds.should.length(1);
                should.deepEqual(founds[0].create_id.toString(), user.id.toString());
                done();
            });
        });

    });

    describe('#belongsTo', function () {
        it('#get (author)', function (done) {
            article.author(function(err, found){
                should.not.exist(err);
                should.exist(found);
                found.first_name.should.be.equal(newUser.first_name);
                found.last_name.should.be.exactly(newUser.last_name);
                should.deepEqual(article.create_id.toString(), found.id.toString());
                done();
            });
        });
    });

    /*
     User.hasMany(Post,   {as: 'posts',  foreignKey: 'userId'});
     // creates instance methods:
     // user.posts(conds)
     // user.posts.build(data) // like new Post({userId: user.id});
     // user.posts.create(data) // build and save

     Post.belongsTo(User, {as: 'author', foreignKey: 'userId'});
     // creates instance methods:
     // post.author(callback) -- getter when called with function
     // post.author() -- sync getter when called without params
     // post.author(user) -- setter when called with object
     */
});
