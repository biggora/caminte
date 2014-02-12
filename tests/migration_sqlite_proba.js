var caminte = require('../index'),
        Schema = caminte.Schema,
        Text = Schema.Text,
        DBNAME = process.env.DBNAME || '/tmp/test_app.db',
        DBENGINE = process.env.DBENGINE || 'sqlite3',
        fs = require('fs');

require('./spec_helper').init(module.exports);

if (fs.existsSync(DBNAME)) {
    fs.unlinkSync(DBNAME);
}

schema = new Schema(DBENGINE, {
    database: DBNAME
});

schema.log = function(q) {
    return console.log(q);
};

queryAll = function(sql, cb) {
    return schema.adapter.queryAll(sql, cb);
};

User = schema.define('User', {
    email: {
        type: String,
        "null": false,
        index: true
    },
    name: String,
    bio: Text,
    password: String,
    birthDate: Date,
    pendingPeriod: Number,
    createdByAdmin: Boolean
}, {
    indexes: {
        index1: {
            columns: 'email, createdByAdmin'
        }
    }
});

getFields = function(model, cb) {
    return queryAll('PRAGMA TABLE_INFO(' + schema.adapter.tableEscaped(model) + ')', function(err, res) {
        var fields;
        if (err) {
            return cb(err);
        } else {
            fields = {};
            res.forEach(function(field) {
                delete field.cid;
                return fields[field.name] = field;
            });
            return cb(err, fields);
        }
    });
};

getIndexes = function(model, cb) {
    return queryAll('PRAGMA INDEX_LIST(' + schema.tableEscaped(model) + ')', function(err, res) {
        var indexes;
        if (err) {
            return cb(err);
        } else {
            indexes = {};
            res.forEach(function(index) {
                if (index.Seq_in_index === '1' || index.Seq_in_index === 1) {
                    return indexes[index.Key_name] = index;
                }
            });
            return cb(err, indexes);
        }
    });
};

it('should run migration', function(test) {
    return schema.autoupdate(function(err) {
        return getFields('User', function(err, fields) {
            test.deepEqual(fields, {
                id: {
                    name: 'id',
                    type: 'INTEGER',
                    notnull: 0,
                    dflt_value: null,
                    pk: 1},
                email: {
                    name: 'email',
                    type: 'VARCHAR(255)',
                    notnull: 1,
                    dflt_value: null,
                    pk: 0},
                name: {
                    name: 'name',
                    type: 'VARCHAR(255)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0},
                bio: {
                    name: 'bio',
                    type: 'TEXT',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0},
                password: {
                    name: 'password',
                    type: 'VARCHAR(255)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0},
                birthDate: {
                    name: 'birthDate',
                    type: 'DATETIME',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0},
                pendingPeriod: {
                    name: 'pendingPeriod',
                    type: 'INT(11)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0},
                createdByAdmin: {
                    name: 'createdByAdmin',
                    type: 'TINYINT(1)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0}});
            return test.done();
        });
    });
});

it('should autoupgrade', function(test) {
    var userExists;
    userExists = function(cb) {
        return queryAll('SELECT * FROM `User` ', function(err, res) {
            return cb(!err && res[0].email === 'test@example.com');
        });
    };

    return User.create({
        email: 'test@example.com',
        bio: 'A\'am BOSS'
    }, function(err, user) {
        if (err) {
            console.log(err);
        }
        test.ok(!err);
        return userExists(function(yep) {
            test.ok(yep);
            User.defineProperty('email', {
                type: String
            });
            User.defineProperty('name', {
                type: String,
                limit: 50
            });
            User.defineProperty('newProperty', {
                type: Number
            });
            User.defineProperty('pendingPeriod', false);

            return schema.autoupdate(function(err) {
                return getFields('User', function(err, fields) {
                    test.equal(fields.email.notnull, 0, 'Email is not null');
                    test.equal(fields.name.type, 'VARCHAR(50)', 'Name is not varchar(50)');
                    test.ok(fields.newProperty, 'New column was not added');
                    if (fields.newProperty) {
                        test.equal(fields.newProperty.type, 'INT(11)', 'New column type is not int(11)');
                    }
                    test.ok(!fields.pendingPeriod, 'drop column');

                    return userExists(function(yep) {
                        test.ok(yep);
                        return process.nextTick(function() {
                            console.log('test.done()')
                            return test.done();
                        });
                    });
                });
            });
        });
    });
});


it('should check actuality of schema', function(test) {
    return User.schema.isActual(function(err, ok) {
        test.ok(ok, 'schema is actual');
        User.defineProperty('email', false);
        return User.schema.isActual(function(err, ok) {
            test.ok(!ok, 'schema is not actual');
            return test.done();
        });
    });
});
/*
 
 it('should add single-column index', function(test) {
 User.defineProperty('email', {
 type: String,
 index: {
 kind: 'FULLTEXT',
 type: 'HASH'
 }
 });
 return User.schema.autoupdate(function(err) {
 if (err) {
 return console.log(err);
 }
 return getIndexes('User', function(err, ixs) {
 test.ok(ixs.email && ixs.email.Column_name === 'email');
 console.log(ixs);
 test.equal(ixs.email.Index_type, 'BTREE', 'default index type');
 return test.done();
 });
 });
 });
 
 
 it('should change type of single-column index', function(test) {
 User.defineProperty('email', {
 type: String,
 index: {
 type: 'BTREE'
 }
 });
 return User.schema.isActual(function(err, ok) {
 test.ok(ok, 'schema is actual');
 User.schema.autoupdate(function(err) {
 });
 if (err) {
 return console.log(err);
 }
 return getIndexes('User', function(err, ixs) {
 test.ok(ixs.email && ixs.email.Column_name === 'email');
 test.equal(ixs.email.Index_type, 'BTREE');
 return test.done();
 });
 });
 });
 
 
 it('should remove single-column index', function(test) {
 User.defineProperty('email', {
 type: String,
 index: false
 });
 return User.schema.autoupdate(function(err) {
 if (err) {
 return console.log(err);
 }
 return getIndexes('User', function(err, ixs) {
 test.ok(!ixs.email);
 return test.done();
 });
 });
 });
 
 
 it('should update multi-column index when order of columns changed', function(test) {
 User.schema.adapter._models.User.settings.indexes.index1.columns = 'createdByAdmin, email';
 return User.schema.isActual(function(err, ok) {
 test.ok(!ok, 'schema is not actual');
 return User.schema.autoupdate(function(err) {
 if (err) {
 return console.log(err);
 }
 return getIndexes('User', function(err, ixs) {
 test.equals(ixs.index1.Column_name, 'createdByAdmin');
 return test.done();
 });
 });
 });
 });
 */
/*
it('test', function(test) {
    User.defineProperty('email', {
        type: String,
        index: true
    });
    return User.schema.autoupdate(function(err) {
        return User.schema.autoupdate(function(err) {
            return User.schema.autoupdate(function(err) {
                return test.done();
            });
        });
    });
});

it('should disconnect when done', function(test) {
    schema.disconnect();
    return test.done();
});
*/

