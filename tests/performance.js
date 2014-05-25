var Schema, Text, schemas, testOrm;

Schema = require('../index').Schema;
Text = Schema.Text;
require('./spec_helper').init(exports);

schemas = {
    neo4j: {
        url: 'http://localhost:7474/'
    },
    mongoose: {
        url: 'mongodb://localhost/test'
    },
    redis: {},
    memory: {},
    cradle: {},
    nano: {
        url: 'http://localhost:5984/nano-test'
    }
};

testOrm = function (schema) {
    var Post, User, maxPosts, maxUsers, users;
    User = Post = 'unknown';
    maxUsers = 100;
    maxPosts = 50000;
    users = [];
    it('should define simple', function (test) {
        User = schema.define('User', {
            name: String,
            bio: Text,
            approved: Boolean,
            joinedAt: Date,
            age: Number
        });
        Post = schema.define('Post', {
            title: {
                type: String,
                length: 255,
                index: true
            },
            content: {
                type: Text
            },
            date: {
                type: Date,
                detault: Date.now
            },
            published: {
                type: Boolean,
                "default": false
            }
        });
        User.hasMany(Post, {
            as: 'posts',
            foreignKey: 'userId'
        });
        Post.belongsTo(User, {
            as: 'author',
            foreignKey: 'userId'
        });
        return test.done();
    });
    it('should create users', function (test) {
        var done, i, wait, _i, _results;
        wait = maxUsers;
        done = function (e, u) {
            users.push(u);
            if (--wait === 0) {
                return test.done();
            }
        };
        _results = [];
        for (i = _i = 1; 1 <= maxUsers ? _i <= maxUsers : _i >= maxUsers; i = 1 <= maxUsers ? ++_i : --_i) {
            _results.push(User.create(done));
        }
        return _results;
    });
    it('should create bunch of data', function (test) {
        var done, num, rnd, wait, _i, _results;
        wait = maxPosts;
        done = function () {
            if (--wait === 0) {
                return test.done();
            }
        };
        rnd = function (title) {
            return {
                userId: users[Math.floor(Math.random() * maxUsers)].id,
                title: 'Post number ' + (title % 5)
            };
        };
        _results = [];
        for (num = _i = 1; 1 <= maxPosts ? _i <= maxPosts : _i >= maxPosts; num = 1 <= maxPosts ? ++_i : --_i) {
            _results.push(Post.create(rnd(num), done));
        }
        return _results;
    });
    it('do some queries using foreign keys', function (test) {
        var done, num, query, ts, wait, _i, _results;
        wait = 4;
        done = function () {
            if (--wait === 0) {
                return test.done();
            }
        };
        ts = Date.now();
        query = function (num) {
            return users[num].posts({
                title: 'Post number 3'
            }, function (err, collection) {
                console.log('User ' + num + ':', collection.length, 'posts in', Date.now() - ts, 'ms');
                return done();
            });
        };
        _results = [];
        for (num = _i = 0; _i <= 4; num = ++_i) {
            _results.push(query(num));
        }
        return _results;
    });
    return;
    return it('should destroy all data', function (test) {
        return Post.destroyAll(function () {
            return User.destroyAll(test.done);
        });
    });
};

Object.keys(schemas).forEach(function (schemaName) {
    if (process.env.ONLY && process.env.ONLY !== schemaName) {
        return;
    }
    return context(schemaName, function () {
        var schema;
        schema = new Schema(schemaName, schemas[schemaName]);
        return testOrm(schema);
    });
});