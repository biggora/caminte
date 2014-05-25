var caminte = require('../index'),
    Schema = caminte.Schema,
    Text = Schema.Text,
    DBNAME = process.env.DBNAME || 'test_app',
    DBUSER = process.env.DBUSER || 'root',
    DBPASS = '',
    DBENGINE = process.env.DBENGINE || 'mysql';
require('./spec_helper').init(module.exports);

schema = new Schema(DBENGINE, {
    host: 'localhost',
    database: '',
    username: DBUSER,
    password: DBPASS
});

schema.log = function (q) {
    return console.log(q);
};

query = function (sql, cb) {
    return schema.adapter.query(sql, cb);
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

withBlankDatabase = function (cb) {
    var db;
    db = schema.settings.database = DBNAME;
    return query('DROP DATABASE IF EXISTS ' + db, function (err) {
        return query('CREATE DATABASE ' + db, function (err) {
            return query('USE ' + db, cb);
        });
    });

};

getFields = function (model, cb) {
    return query('SHOW FIELDS FROM ' + model, function (err, res) {
        var fields;
        if (err) {
            return cb(err);
        } else {
            fields = {};
            res.forEach(function (field) {
                return fields[field.Field] = field;
            });
            return cb(err, fields);
        }
    });
};

getIndexes = function (model, cb) {
    return query('SHOW INDEXES FROM ' + model, function (err, res) {
        var indexes;
        if (err) {
            return cb(err);
        } else {
            indexes = {};
            res.forEach(function (index) {
                if (index.Seq_in_index === '1' || index.Seq_in_index === 1) {
                    return indexes[index.Key_name] = index;
                }
            });
            return cb(err, indexes);
        }
    });
};

it('should run migration', function (test) {
    return withBlankDatabase(function (err) {
        if (err) {
            console.log('ERR 1: ', err)
        }
        return schema.autoupdate(function (err) {
            if (err) {
                console.log('ERR 2: ', err)
            }
            return getFields('User', function (err, fields) {
                if (err) {
                    console.log('ERR 3: ', err)
                }
                test.deepEqual(fields, {
                    id: {
                        Field: 'id',
                        Type: 'int(11)',
                        Null: 'NO',
                        Key: 'PRI',
                        Default: null,
                        Extra: 'auto_increment'},
                    email: {
                        Field: 'email',
                        Type: 'varchar(255)',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    name: {
                        Field: 'name',
                        Type: 'varchar(255)',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    bio: {
                        Field: 'bio',
                        Type: 'text',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    password: {
                        Field: 'password',
                        Type: 'varchar(255)',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    birthDate: {
                        Field: 'birthDate',
                        Type: 'datetime',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    pendingPeriod: {
                        Field: 'pendingPeriod',
                        Type: 'int(11)',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''},
                    createdByAdmin: {
                        Field: 'createdByAdmin',
                        Type: 'tinyint(1)',
                        Null: 'YES',
                        Key: '',
                        Default: null,
                        Extra: ''}});
                return test.done();
            });
        });
    });
});

it('should autoupgrade', function (test) {
    var userExists;
    userExists = function (cb) {
        return query('SELECT * FROM `User` ', function (err, res) {
            return cb(!err && res[0].email === 'test@example.com');
        });
    };

    return User.create({
        email: 'test@example.com',
        bio: 18
    }, function (err, user) {
        if (err) {
            console.log(err);
        }
        test.ok(!err);
        return userExists(function (yep) {
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

            return schema.autoupdate(function (err) {
                if (err) {
                    console.log(err);
                }
                return getFields('User', function (err, fields) {
                    if (err) {
                        console.log(err);
                    }
                    test.equal(fields.email.Null, 'YES', 'Email is not null');
                    test.equal(fields.name.Type, 'varchar(50)', 'Name is not varchar(50)');
                    test.ok(fields.newProperty, 'New column was not added');
                    if (fields.newProperty) {
                        test.equal(fields.newProperty.Type, 'int(11)', 'New column type is not int(11)');
                    }
                    test.ok(!fields.pendingPeriod, 'drop column');
                    return userExists(function (yep) {
                        test.ok(yep);
                        return test.done();
                    });
                });
            });

        });
    });
});


it('should check actuality of schema', function (test) {
    return User.schema.isActual(function (err, ok) {
        test.ok(ok, 'schema is actual');
        User.defineProperty('email', false);
        return User.schema.isActual(function (err, ok) {
            test.ok(!ok, 'schema is not actual');
            return test.done();
        });
    });
});


it('should add single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        index: {
            kind: 'FULLTEXT',
            type: 'HASH'
        }
    });
    return User.schema.autoupdate(function (err) {
        if (err) {
            return console.log(err);
        }
        return getIndexes('User', function (err, ixs) {
            test.ok(ixs.email && ixs.email.Column_name === 'email');
            test.equal(ixs.email.Index_type, 'BTREE', 'default index type');
            return test.done();
        });
    });
});


it('should change type of single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        index: {
            type: 'BTREE'
        }
    });
    return User.schema.isActual(function (err, ok) {
        test.ok(ok, 'schema is actual');
        User.schema.autoupdate(function (err) {
        });
        if (err) {
            return console.log(err);
        }
        return getIndexes('User', function (err, ixs) {
            test.ok(ixs.email && ixs.email.Column_name === 'email');
            test.equal(ixs.email.Index_type, 'BTREE');
            return test.done();
        });
    });
});


it('should remove single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        index: false
    });
    return User.schema.autoupdate(function (err) {
        if (err) {
            return console.log(err);
        }
        return getIndexes('User', function (err, ixs) {
            test.ok(!ixs.email);
            return test.done();
        });
    });
});


it('should update multi-column index when order of columns changed', function (test) {
    User.schema.adapter._models.User.settings.indexes.index1.columns = 'createdByAdmin, email';
    return User.schema.isActual(function (err, ok) {
        test.ok(!ok, 'schema is not actual');
        return User.schema.autoupdate(function (err) {
            if (err) {
                return console.log(err);
            }
            return getIndexes('User', function (err, ixs) {
                test.equals(ixs.index1.Column_name, 'createdByAdmin');
                return test.done();
            });
        });
    });
});

it('test', function (test) {
    User.defineProperty('email', {
        type: String,
        index: true
    });
    return User.schema.autoupdate(function (err) {
        return User.schema.autoupdate(function (err) {
            return User.schema.autoupdate(function (err) {
                return test.done();
            });
        });
    });
});

it('should disconnect when done', function (test) {
    schema.disconnect();
    return test.done();
});

