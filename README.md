[![Build Status](https://travis-ci.org/biggora/caminte.svg?branch=master)](https://travis-ci.org/biggora/caminte)
[![Dependency Status](https://gemnasium.com/biggora/caminte.svg)](https://gemnasium.com/biggora/caminte)
[![NPM version](https://badge.fury.io/js/caminte.svg)](http://badge.fury.io/js/caminte)
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
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/arangodb.png"/></td>
      <td><img width="100" src="https://github.com/biggora/caminte/raw/master/media/cassandra.png"/></td>
    </tr>
</table>

## Installation

First install [node.js](http://nodejs.org/). Then:

    $ npm install caminte --save


## Overview

* [Command line interface](https://github.com/biggora/caminte#cli)
* [Usage](https://github.com/biggora/caminte#usage)
* [Connecting to DB](https://github.com/biggora/caminte/wiki/Connecting-to-DB#connecting)
* [Defining a Model](https://github.com/biggora/caminte/wiki/Defining-a-Model#define-model)
* [Define Indices](https://github.com/biggora/caminte/wiki/Defining-a-Model#define-indices)
* [Define Primary Keys](https://github.com/biggora/caminte/wiki/Defining-a-Model#define-primary-keys)
* [Schema data types](https://github.com/biggora/caminte/wiki/Schema-data-types#types)
* [Accessing a Model](https://github.com/biggora/caminte/wiki/Defining-a-Model#accessing-a-model)
* [Setup Relationships](https://github.com/biggora/caminte/wiki/Setup-Relationships-&-Validations#setup-relationships)
* [Setup Validations](https://github.com/biggora/caminte/wiki/Setup-Relationships-&-Validations#setup-validations)
* [Common API methods](https://github.com/biggora/caminte/wiki/Common-API-methods#api)
* [Define any Custom Method](https://github.com/biggora/caminte/wiki/Common-API-methods#custom)
* [Query Interface](https://github.com/biggora/caminte/wiki/Query-Interface#queries)
* [Middleware (Hooks)](https://github.com/biggora/caminte/wiki/Middleware#middleware)
* [Object lifecycle](https://github.com/biggora/caminte/wiki/Object-lifecycle#lifecycle)
* [Your own database adapter](https://github.com/biggora/caminte/wiki/Your-own-database-adapter#adapter)
* [Running tests](https://github.com/biggora/caminte/wiki/Running-tests)


## Online model creator

Create CaminteJS Models in few minutes with [online model creator](http://www.camintejs.com/en/creator). 

## CLI

Use the command line interface tool, `caminte`, to quickly create an models.

    $ npm install caminte-cli -g
    
Create structure:

    $ caminte -i -a mysql
    
Create model:

    $ caminte -m User active:int name email password note:text created:date
    # with tests  
    $ caminte -t -m User active:int name email password note:text created:date
    
Create model and routes:

    $ caminte -c Post published:bool title content:text created:date
    # with tests    
    $ caminte -t -c User active:int name email password note:text created:date
    
    
Create model and routes from SQL dump:

    $ caminte -d dumpfile.sql
    
[caminte-cli more details.](https://github.com/biggora/caminte-cli)


## Usage

```javascript
var caminte = require('caminte');
var Schema  = caminte.Schema;
var schema  = new Schema('redis', {port: 6379});

// define models
var Post = schema.define('Post', {
    title:     { type: schema.String,  limit: 255 },
    userId:    { type: schema.Number },
    content:   { type: schema.Text },
    created:   { type: schema.Date,    default: Date.now },
    updated:   { type: schema.Date },
    published: { type: schema.Boolean, default: false, index: true }
});

var User = schema.define('User', {
    name:       { type: schema.String,  limit: 255 },
    bio:        { type: schema.Text },
    email:      { type: schema.String,  limit: 155, unique: true },
    approved:   { type: schema.Boolean, default: false, index: true }
    joinedAt:   { type: schema.Date,    default: Date.now },
    age:        { type: schema.Number },
    gender:     { type: schema.String,  limit: 10 }
});

// setup hooks
Post.afterUpdate = function (next) {
    this.updated = new Date();
    this.save();
    next();
};

// define any custom method for instance
User.prototype.getNameAndAge = function () {
    return this.name + ', ' + this.age;
};

// define scope
Post.scope('active', { published : true });

// setup validations
User.validatesPresenceOf('name', 'email');
User.validatesUniquenessOf('email', {message: 'email is not unique'});
User.validatesInclusionOf('gender', {in: ['male', 'female']});
User.validatesNumericalityOf('age', {int: true});

// setup relationships
User.hasMany(Post,   {as: 'posts',  foreignKey: 'userId'});

// Common API methods

var user = new User({ 
    name:       'Alex',
    email:      'example@domain.aga',
    age:        40,
    gender:     'male'
});

user.isValid(function (valid) {
    if (!valid) {
        return console.log(user.errors);
    }
    user.save(function(err){
        if (!err) {
            return console.log(err);
        }
        console.log('User created');
    });
})

// just instantiate model
new Post
// save model (of course async)
Post.create(cb);
// all posts
Post.all(cb)
// all posts by user
Post.all({where: {userId: user.id}, order: 'id', limit: 10, skip: 20});
// the same as prev
user.posts(cb)
// get one latest post
Post.findOne({where: {published: true}, order: 'date DESC'}, cb);
// same as new Post({userId: user.id});
user.posts.build
// save as Post.create({userId: user.id}, cb);
user.posts.create(cb)
// find instance by id
User.findById(1, cb)
// count instances
User.count([conditions, ]cb)
// destroy instance
user.destroy(cb);
// destroy all instances
User.destroyAll(cb);

// models also accessible in schema:
schema.models.User;
schema.models.Post;
```

## Package structure

Now all common logic described in `./lib/*.js`, and database-specific stuff in `./lib/adapters/*.js`. It's super-tiny, right?

## Contributing

If you have found a bug please write unit test, and make sure all other tests still pass before pushing code to repo.

## Recommend extensions

- [TrinteJS - Javascrpt MVC Framework for Node.JS](http://www.trintejs.com/)
- [Cross-db Session Storage for ExpressJS](https://github.com/biggora/connect-caminte)
- [MongoDB Session Storage for ExpressJS](https://github.com/biggora/express-mongodb)
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

[![Analytics](https://ga-beacon.appspot.com/UA-22788134-5/caminte/readme)](https://github.com/igrigorik/ga-beacon) 
[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/biggora/caminte/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

