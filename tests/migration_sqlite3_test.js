var caminte = require('../index'),
    Schema = caminte.Schema,
    Text = Schema.Text,
    DBNAME = process.env.DBNAME || ':memory:',
    DBENGINE = process.env.DBENGINE || 'sqlite3';
require('./spec_helper').init(module.exports);

schema = new Schema(DBENGINE, {
    database: DBNAME
});

schema.log = function (q) {
    return console.log(q);
};

query = function (sql, cb) {
    return schema.adapter.queryAll(sql, cb);
};

User = schema.define('User', {
    email: {
        type: schema.String,
        "null": false,
        index: true
    },
    name: {
        type: schema.String,
        "null": false,
        index: true
    },
    bio: schema.Text,
    password: schema.String,
    birthDate: schema.Date,
    pendingPeriod: schema.Number,
    createdByAdmin: schema.Boolean
}, {
    indexes: {
        index1: {
            columns: 'email, createdByAdmin'
        },
        index2: {
            columns: 'name'
        }
    }
});

Student = schema.define("Student", {
    stuID: {
        type: Number
    },
    school: String
}, {
    primaryKeys: ["stuID"],
    foreignKeys: [{
        localCol: "stuID",
        foreignTable: "User",
        foreignCol: "id",
        onDelete: true,
        onUpdate: true
    }]
});

getFields = function (model, cb) {
    return query('PRAGMA TABLE_INFO(`' + model + '`);', function (err, res) {
        var fields;
        if (err) {
            return cb(err);
        } else {
            fields = {};
            (res || []).forEach(function (field) {
                delete field.cid;
                return fields[field.name] = field;
            });
            return cb(err, fields);
        }
    });
};

getIndexes = function (model, cb) {
    return query('PRAGMA INDEX_LIST(`' + model + '`);', function (err, res) {
        var indexes;
        if (err) {
            return cb(err);
        } else {
            indexes = {};
            (res || []).forEach(function (index) {
                // if (index.Seq_in_index === '1' || index.Seq_in_index === 1) {
                // delete index.seq;
                return indexes[index.name] = index;
                // }
            });
            return cb(err, indexes);
        }
    });
};

it('SQlite - should run migration', function (test) {
    return schema.autoupdate(function (err) {
        if (err) {
            console.log('ERR 2: ', err)
        }
        return getFields('User', function (err, ufields) {
            if (err) {
                console.log('ERR 3: ', err)
            }
            test.deepEqual(ufields, {
                id: {
                    name: 'id',
                    type: 'INTEGER',
                    notnull: 1,
                    dflt_value: null,
                    pk: 1
                },
                email: {
                    name: 'email',
                    type: 'VARCHAR(255)',
                    notnull: 1,
                    dflt_value: null,
                    pk: 0
                },
                name: {
                    name: 'name',
                    type: 'VARCHAR(255)',
                    notnull: 1,
                    dflt_value: null,
                    pk: 0
                },
                bio: {
                    name: 'bio',
                    type: 'TEXT',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0
                },
                password: {
                    name: 'password',
                    type: 'VARCHAR(255)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0
                },
                birthDate: {
                    name: 'birthDate',
                    type: 'DATETIME',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0
                },
                pendingPeriod: {
                    name: 'pendingPeriod',
                    type: 'INTEGER(11)',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0
                },
                createdByAdmin: {
                    name: 'createdByAdmin',
                    type: 'BOOL',
                    notnull: 0,
                    dflt_value: null,
                    pk: 0
                }
            });
            return schema.autoupdate(function (err) {
                if (err) {
                    console.log('ERR 4: ', err)
                }
                return getFields('Student', function (err, sfields) {
                    if (err) {
                        console.log('ERR 4: ', err);
                    }
                    test.deepEqual(sfields, {
                        stuID: {
                            name: 'stuID',
                            type: 'INTEGER(11)',
                            notnull: 0,
                            dflt_value: null,
                            pk: 1
                        },
                        school: {
                            name: 'school',
                            type: 'VARCHAR(255)',
                            notnull: 0,
                            dflt_value: null,
                            pk: 0
                        }
                    });
                    return test.done();
                });
            });
        });
    });
});

it('SQlite - should autoupgrade', function (test) {
    var userExists;
    userExists = function (cb) {
        return query('SELECT * FROM `User` ', function (err, res) {
            return cb(!err && res[0].email === 'test@example.com');
        });
    };
    return User.create({
        name: 'Sergio',
        email: 'test@example.com',
        bio: 18
    }, function (err, user) {
        if (err) {
            console.log(err);
        }
        test.ok(!err, 'select query with errors');
        return userExists(function (yep) {
            test.ok(yep, 'current row not available');
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
                    test.equal(fields.email.notnull, 0, 'Email is not null');
                    test.equal(fields.name.type, 'VARCHAR(50)', 'Name is not VARCHAR(50)');
                    test.ok(fields.newProperty, 'New column was not added');
                    if (fields.newProperty) {
                        test.equal(fields.newProperty.type, 'INTEGER(11)', 'New column type is not INTEGER(11)');
                    }
                    test.ok(!fields.pendingPeriod, 'drop column');
                    return userExists(function (yep) {
                        test.ok(yep, 'row is not available');
                        return test.done();
                    });
                });
            });
        });
    });
});

it('SQlite - should check actuality of schema', function (test) {
    return User.schema.isActual(function (err, ok) {
        test.ok(ok, 'schema is actual');
        User.defineProperty('email', false);
        return User.schema.isActual(function (err, ok) {
            test.ok(!ok, 'schema is not actual');
            return test.done();
        });
    });
});

it('SQlite - should add single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        index: true
    });
    return User.schema.autoupdate(function (err) {
        if (err) {
            return console.log(err);
        }
        return getIndexes('User', function (err, ixs) {
            test.ok(ixs.User_email && ixs.User_email.name === 'User_email');
            test.equal(ixs.User_email.unique, 0, 'index is unque');
            return test.done();
        });
    });
});

it('SQlite should change type of single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        unique: true
    });
    return User.schema.isActual(function (err, ok) {
        test.ok(!ok, 'schema is actual');
        return User.schema.autoupdate(function (err) {
            if (err) {
                return console.log(err);
            }
            return getIndexes('User', function (err, ixs) {
                test.ok(ixs.User_email && ixs.User_email.name === 'User_email');
                test.equal(ixs.User_email.unique, 1, 'index is not unique');
                return test.done();
            });
        });
    });
});

it('SQlite - should remove single-column index', function (test) {
    User.defineProperty('email', {
        type: String,
        index: false
    });
    return User.schema.autoupdate(function (err) {
        if (err) {
            return console.log(err);
        }
        return getIndexes('User', function (err, ixs) {
            test.ok(!ixs.User_email);
            return test.done();
        });
    });
});


it('SQlite - should update multi-column index when order of columns changed', function (test) {
    User.schema.adapter._models.User.settings.indexes.index1.columns = 'createdByAdmin, email';
    return User.schema.isActual(function (err, ok) {
        test.ok(!ok, 'schema is not actual');
        return User.schema.autoupdate(function (err) {
            if (err) {
                return console.log(err);
            }
            return getIndexes('User', function (err, ixs) {
                test.equals(ixs.User_index1.name, 'User_index1');
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

it('SQlite - should disconnect when done', function (test) {
    schema.disconnect();
    return test.done();
});
