[![Build Status](https://travis-ci.org/biggora/caminte.png?branch=master)](https://travis-ci.org/biggora/caminte)
[![Dependency Status](https://gemnasium.com/biggora/caminte.png)](https://gemnasium.com/biggora/caminte)
[![NPM version](https://badge.fury.io/js/caminte.png)](http://badge.fury.io/js/caminte)
## About CaminteJS

CaminteJS is cross-db ORM for nodejs, providing common interface to access
most popular database formats.

#### CaminteJS adapters:
    mysql, sqlite3, riak, postgres, couchdb, mongodb, redis, neo4j, firebird, rethinkdb, tingodb

<table>
    <tr>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/memory.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/mongodb.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/mysql.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/postgresql.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/sqlite.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/mariadb.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/firebird.png"/></td>   
    </tr>
    <tr>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/couchdb.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/rethinkdb.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/redis.png"/></td> 
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/tingodb.png"/></td>      
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/neo4j.png"/></td> 
      <td colspan="2"></td>
    </tr>
</table>

## Installation

First install [node.js](http://nodejs.org/). Then:

    $ npm install caminte -g

## Overview

* [Connecting to DB](#connecting)
* [Defining a Model](#defining)
* [Accessing a Model](#accessing)
* [Setup Validations](#validations)
* [Common API methods](#api)
* [Define any Custom Method](#custom)
* [Queries](#queries)
* [Middleware (Hooks)](#middleware)
* [Object lifecycle](#lifecycle)
* [Your own database adapter](#adapter)
* [Running tests](#running_tests)

<a name="connecting"></a>
### Connecting to DB

First, we need to define a connection.

#### MySQL

For MySQL database need install [mysql client](https://github.com/felixge/node-mysql/). Then:

    $ npm install mysql -g

```javascript
    var caminte = require('caminte'),
    Schema = caminte.Schema,
    db = {
         driver     : "mysql",
         host       : "localhost",
         port       : "3306",
         username   : "test",
         password   : "test",
         database   : "test"
         pool       : true // optional for use pool directly 
    };

    var schema = new Schema(db.driver, db);
```

#### Redis

For Redis database need install [redis client](https://github.com/mranney/node_redis/). Then:

    $ npm install redis -g

```javascript
    var caminte = require('caminte'),
    Schema = caminte.Schema,
    db = {
         driver     : "redis",
         host       : "localhost",
         port       : "6379"
    };

    var schema = new Schema(db.driver, db);
```

#### SQLite

For SQLite database need install [sqlite3 client](https://github.com/developmentseed/node-sqlite3/). Then:

    $ npm install sqlite3 -g

```javascript
    var caminte = require('caminte'),
    Schema = caminte.Schema,
    db = {
         driver     : "sqlite3",
         database   : "/db/mySite.db"
    };

    var schema = new Schema(db.driver, db);
```

<a name="defining"></a>
### Defining a Model

Models are defined through the `Schema` interface.

```javascript
// define models
var Post = schema.define('Post', {
    title:     { type: schema.String,  limit: 255 },
    content:   { type: schema.Text },
    params:    { type: schema.JSON },
    date:      { type: schema.Date,    default: Date.now },
    published: { type: schema.Boolean, default: false, index: true }
});

// simplier way to describe model
var User = schema.define('User', {
    name:         String,
    bio:          schema.Text,
    approved:     Boolean,
    joinedAt:     Date,
    age:          Number
});
```

<a name="accessing"></a>
### Accessing a Model

```javascript
// models also accessible in schema:
schema.models.User;
schema.models.Post;
```

<a name="relationships"></a>
### Setup Relationships

```javascript
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

// work with models:
var user = new User;
user.save(function (err) {
    var post = user.posts.build({title: 'Hello world'});
    post.save(console.log);
});
```

<a name="validations"></a>
### Setup Validations

```javascript
User.validatesPresenceOf('name', 'email')
User.validatesLengthOf('password', {min: 5, message: {min: 'Password is too short'}});
User.validatesInclusionOf('gender', {in: ['male', 'female']});
User.validatesExclusionOf('domain', {in: ['www', 'billing', 'admin']});
User.validatesNumericalityOf('age', {int: true});
User.validatesUniquenessOf('email', {message: 'email is not unique'});

user.isValid(function (valid) {
    if (!valid) {
        user.errors // hash of errors {attr: [errmessage, errmessage, ...], attr: ...}
    }
})
```

<a name="api"></a>
### Common API methods
* [create](#create)
* [all, run](#all)
* [find](#find)
* [findOrCreate](#findorcreate)
* [findOne](#findone)
* [findById](#findbyid)
* [update](#update)
* [updateOrCreate, upsert](#upsert)
* [count](#count)
* [remove](#remove)
* [destroy](#destroy)
* [destroyAll](#destroyall)

#### Just instantiate model

```javascript
   var post = new Post();
```

<a name="create"></a>
#### #create(callback)

Save model (of course async)

```javascript
Post.create(function(err){
   // your code here
});
// same as new Post({userId: user.id});
user.posts.build
// save as Post.create({userId: user.id}, function(err){
   // your code here
});
user.posts.create(function(err){
   // your code here
});
```

<a name="all"></a>
#### #all(params, callback)

Get all instances

```javascript
// all published posts
var Query = Post.all();
Query.where('published', true).desc('date');
Query.run({}, function(err, post){
   // your code here
});
// all posts
Post.all(function(err, posts){
   // your code here
});
// all posts by user
Post.all({where: {userId: 2}, order: 'id', limit: 10, skip: 20}, function(err, posts){
   // your code here
});
// the same as prev
user.posts(function(err, posts){
   // your code here
})
```

<a name="find"></a>
#### #find(params, callback)

Find instances

```javascript
// all posts
Post.find(function(err, posts){
   // your code here
});

// all posts by user
var Query = Post.find();
Query.where('userId', 2);
Query.order('id', 'ASC');
Query.skip(20).limit(10);

Query.run({},function(err, posts){
   // your code here
});

// the same as prev
Post.find({where: {userId: user.id}, order: 'id', limit: 10, skip: 20}, function(err, posts){
   // your code here
});
```

<a name="findorcreate"></a>
#### #findOrCreate(params, data, callback)

Find if exists or create instance.

```javascript
// find user by email
User.findOrCreate({
      email : 'example@example.com'
    }, {
      name : 'Gocha',
      age : 31
    }, function(err, user){
      // your code here
});
```

<a name="findone"></a>
#### #findOne(params, callback)

Get one latest instance
{where: {published: true}, order: 'date DESC'}
```javascript
Post.findOne({where: {published: true}, order: 'date DESC'}, function(err, post){
   // your code here
});
// or
var Query = Post.findOne();
Query.where('published',true).desc('date');
Query.run({}, function(err, post){
   // your code here
});
```

<a name="findbyid"></a>
#### #findById(id, callback)

Find instance by id

```javascript
User.findById(1, function(err, user){
   // your code here
})
```

<a name="upsert"></a>
#### #updateOrCreate(params, data, callback)

Update if exists or create instance

```javascript
Post.updateOrCreate({
      id: 100
    }, {
      title: 'Riga',
      tag: 'city'
    }, function(err, post){
      // your code here
});
// or
User.updateOrCreate({
      email: 'example@example.com'
    }, {
      name: 'Alex',
      age: 43
    }, function(err, user){
      // your code here
});
```
<a name="update"></a>
#### #update(params, data, callback)

Update if exists instance

```javascript
User.update({
      where : {
           email: 'example@example.com'
        }
    }, {
      active: 0
    }, function(err, user){
      // your code here
});
// or
 Post.update({
       id: {
          inq: [100, 101, 102]
       }
     }, {
       tag: 'city'
     }, function(err, post){
       // your code here
 });
```

<a name="count"></a>
#### #count(params, callback)

Count instances

```javascript
// count posts by user
Post.count({where: {userId: user.id}}, function(err, count){
   // your code here
});
```

<a name="remove"></a>
#### #remove(params, callback)

Remove instances.

```javascript
// remove all unpublished posts
Post.remove({where: {published: false}},function(err){
   // your code here
});
```

<a name="destroy"></a>
#### #destroy(callback)

Destroy instance

```javascript
User.findById(22, function(err, user) {
    user.destroy(function(err){
       // your code here
    });
});
// or
User.destroyById(22, function(err) {
    // your code here
});
```

<a name="destroyall"></a>
#### #destroyAll(callback)

Destroy all instances

```javascript
User.destroyAll(function(err){
   // your code here
});
```
<a name="scope"></a>
### Define scope

```javascript
Post.scope('active', { published : true });

Post.active(function(err, posts){
    // your code here
});

```

<a name="custom"></a>
### Define any Custom Method

```javascript
User.prototype.getNameAndAge = function () {
    return this.name + ', ' + this.age;
};
```

<a name="queries"></a>
### Queries

#### API methods

* [where](#where)
* [gt](#gt)
* [gte](#gte)
* [lt](#lt)
* [lte](#lte)
* [ne](#ne)
* [in, inq] (#in)
* [nin](#nin)
* [regex](#regex)
* [like](#like)
* [nlike](#nlike)
* [sort, order](#sort)
* [group](#group)
* [asc](#asc)
* [desc](#desc)
* [limit](#limit)
* [skip](#skip)
* [slice](#slice)
* [between](#between)

#### Example Queries
```javascript
var Query = User.find();
Query.where('active', 1);
Query.order('id DESC');
Query.run({}, function(err, users) {
   // your code here
});
```
<a name="where"></a>
#### #where(key, val)

```javascript
var Query = User.find();
Query.where('userId', user.id);
Query.run({}, function(err, count){
   // your code here
});
// the same as prev
User.find({where: {userId: user.id}}, function(err, users){
   // your code here
});
```
<a name="gt"></a>
#### #gt(key, val)

Specifies a greater than expression.

```javascript
Query.gt('userId', 100);
Query.where('userId').gt(100);
// the same as prev
User.find({
      where: {
         userId: {
              gt : 100
         }
      }
    }}, function(err, users){
   // your code here
});
```
<a name="gte"></a>
#### #gte(key, val)

Specifies a greater than or equal to expression.

```javascript
Query.gte('userId', 100);
Query.where('userId').gte(100);
// the same as prev
User.find({
      where: {
         userId: {
              gte : 100
         }
      }
    }}, function(err, users){
   // your code here
});
```
<a name="lt"></a>
#### #lt(key, val)

Specifies a less than expression.

```javascript
Query.lt('visits', 100);
Query.where('visits').lt(100);
// the same as prev
Post.find({
      where: {
         visits: {
              lt : 100
         }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="lte"></a>
#### #lte(key, val)

Specifies a less than or equal to expression.

```javascript
Query.lte('visits', 100);
Query.where('visits').lte(100);
// the same as prev
Post.find({
      where: {
         visits: {
              lte : 100
         }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="ne"></a>
#### #ne(key, val)

Matches all values that are not equal to the value specified in the query.

```javascript
Query.ne('userId', 100);
Query.where('userId').ne(100);
// the same as prev
User.find({
      where: {
         userId: {
              ne : 100
         }
      }
    }}, function(err, users){
   // your code here
});
```
<a name="in"></a>
#### #in(key, val)

Matches any of the values that exist in an array specified in the query.

```javascript
Query.in('userId', [1,5,7,9]);
Query.where('userId').in([1,5,7,9]);
// the same as prev
User.find({
      where: {
         userId: {
              in : [1,5,7,9]
         }
      }
    }}, function(err, users){
   // your code here
});
```
<a name="regex"></a>
#### #regex(key, val)

Selects rows where values match a specified regular expression.

```javascript
Query.regex('title', 'intel');
Query.where('title').regex('intel');
// the same as prev
Post.find({
      where: {
         title: {
              regex : 'intel'
         }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="like"></a>
#### #like(key, val)

Pattern matching using a simple regular expression comparison.

```javascript
Query.like('title', 'intel');
// the same as prev
Post.find({
      where: {
         title: {
              like : 'intel'
         }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="nlike"></a>
#### #nlike(key, val)

Pattern not matching using a simple regular expression comparison.

```javascript
Query.nlike('title', 'intel');
// the same as prev
Post.find({
      where: {
         title: {
              nlike : 'intel'
         }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="nin"></a>
#### #nin(key, val)

Matches values that do not exist in an array specified to the query.

```javascript
Query.nin('id', [1,2,3]);
// the same as prev
Post.find({
      where: {
          title : {
                   nin : [1,2,3]
          }
      }
    }}, function(err, posts){
   // your code here
});
```
<a name="sort"></a>
#### #sort(key, val)

Sets the sort column and direction.

```javascript
Query.sort('title DESC');
Query.sort('title', 'DESC');
// the same as prev
Post.find({
      order: 'title DESC'
    }}, function(err, posts){
   // your code here
});
```
<a name="group"></a>
#### #group(key)

Sets the group by column.

```javascript
Query.group('title');
// is the same as
Post.find({
      group: 'title'
    }}, function(err, posts){
   // your code here
});
```
<a name="asc"></a>
#### #asc(key)

Sets the sort column and direction ASC.

```javascript
Query.asc('title');
// is the same as
Query.sort('title ASC');
// the same as prev
Post.find({
      order: 'title ASC'
    }}, function(err, posts){
   // your code here
});
```
<a name="desc"></a>
#### #desc(key)

Sets the sort column and direction DESC.

```javascript
Query.desc('title');
// is the same as
Query.sort('title DESC');
// the same as prev
Post.find({
      order: 'title DESC'
    }}, function(err, posts){
   // your code here
});
```
<a name="skip"></a>
#### #skip(val)

The skip method specifies at which row the database should begin returning results.

```javascript
Query.skip(10);
// the same as prev
Post.find({
      skip: 10
    }}, function(err, posts){
   // your code here
});
```
<a name="limit"></a>
#### #limit(val)

The limit method specifies the max number of rows to return.

```javascript
Query.limit(10);
// the same as prev
Post.find({
      limit: 10
    }}, function(err, posts){
   // your code here
});
```
<a name="slice"></a>
#### #slice(val)

Limits the number of elements projected from an array. Supports skip and limit slices.

```javascript
Query.slice([20,10]);
// the same as prev
Post.find({
      skip: 20,
      limit: 10
    }}, function(err, posts){
   // your code here
});
```
<a name="between"></a>
#### #between(key, val)

Check whether a value is within a range of values.

```javascript
Query.between('created', ['2013-01-01','2013-01-08']);
// the same as prev
Post.find({
      where: {
         created: {
            between : ['2013-01-01','2013-01-08']
         }
      }
    }}, function(err, posts){
   // your code here
});
```

<a name="middleware"></a>
### Middleware (Hooks)

The following callbacks supported:

    - afterInitialize
    - beforeCreate
    - afterCreate
    - beforeSave
    - afterSave
    - beforeUpdate
    - afterUpdate
    - beforeDestroy
    - afterDestroy
    - beforeValidation
    - afterValidation


```javascript
User.afterUpdate = function (next) {
    this.updated_ts = new Date();
    this.save();
    // Pass control to the next
    next();
};
```

Each callback is class method of the model, it should accept single argument: `next`, this is callback which
should be called after end of the hook. Except `afterInitialize` because this method is syncronous (called after `new Model`).


### Automigrate
required only for mysql NOTE: it will drop User and Post tables

```javascript
schema.automigrate();
```

<a name="lifecycle"></a>
## Object lifecycle:

```javascript
var user = new User;
// afterInitialize
user.save(callback);
// beforeValidation
// afterValidation
// beforeSave
// beforeCreate
// afterCreate
// afterSave
// callback
user.updateAttribute('email', 'email@example.com', callback);
// beforeValidation
// afterValidation
// beforeUpdate
// afterUpdate
// callback
user.destroy(callback);
// beforeDestroy
// afterDestroy
// callback
User.create(data, callback);
// beforeValidate
// afterValidate
// beforeCreate
// afterCreate
// callback
```

Read the tests for usage examples: ./test/common_test.js
Validations: ./test/validations_test.js

<a name="adapter"></a>
## Your own database adapter

To use custom adapter, pass it's package name as first argument to `Schema` constructor:

    mySchema = new Schema('couch-db-adapter', {host:.., port:...});

Make sure, your adapter can be required (just put it into ./node_modules):

    require('couch-db-adapter');

<a name="running_tests"></a>
## Running tests

To run all tests (requires all databases):

    npm test

If you run this line, of course it will fall, because it requres different databases to be up and running,
but you can use js-memory-engine out of box! Specify ONLY env var:

    ONLY=memory nodeunit test/common_test.js

of course, if you have redis running, you can run

    ONLY=redis nodeunit test/common_test.js

## Package structure

Now all common logic described in `./lib/*.js`, and database-specific stuff in `./lib/adapters/*.js`. It's super-tiny, right?

## Contributing

If you have found a bug please write unit test, and make sure all other tests still pass before pushing code to repo.

## Recommend extensions

- [TrinteJS - Javascrpt MVC Framework for Node.JS](http://www.trintejs.com/)
- [Cross-db Session Storage for ExpressJS](https://github.com/biggora/express-mongodb)
- [MongoDB Session Storage for ExpressJS](https://github.com/biggora/connect-caminte)
- [Middleware exposing user-agent for NodeJS](https://github.com/biggora/express-useragent)
- [Uploading files middleware for NodeJS](https://github.com/biggora/express-uploader)
- [2CO NodeJS adapter for 2checkout API payment gateway](https://github.com/biggora/2co)

## License

(The MIT License)

Copyright (c) 2011 by Anatoliy Chakkaev <mail [åt] anatoliy [døt] in>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Resources

- Visit the [author website](http://www.gordejev.lv).
- Visit the [CaminteJS](http://www.camintejs.com) home page.
- Follow [@biggora](https://twitter.com/#!/biggora) on Twitter for updates.
- Report issues on the [github issues](https://github.com/biggora/caminte/issues) page.

[![Analytics](https://ga-beacon.appspot.com/UA-22788134-5/caminte/readme)](https://github.com/igrigorik/ga-beacon) [![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/biggora/caminte/trend.png)](https://bitdeli.com/free "Bitdeli Badge")
