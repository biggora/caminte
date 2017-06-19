exports.inherits = function(newClass, baseClass) {
    Object.keys(baseClass).forEach(function(classMethod) {
        newClass[classMethod] = baseClass[classMethod];
    });
    Object.keys(baseClass.prototype).forEach(function(instanceMethod) {
        newClass.prototype[instanceMethod] = baseClass.prototype[instanceMethod];
    });
};

exports.safeRequire = function safeRequire(module) {
    try {
        return require(module);
    } catch (e) {
        var str = module;
        if(module === 'rethinkdb') { str = module + ' generic-pool moment async'; }
        console.log('Run "npm install ' + str + '" command to using ' + module + ' database engine');
        process.exit(1);
    }
};

exports.getState = function getState(orm) {
    switch (orm.name) {
        case 'mysql':
        case 'mariadb':
            if (orm.client) {
                if (orm.client._protocol) {
                    if (orm.client._protocol._fatalError) {
                        if (orm.client._protocol._fatalError.fatal) {
                            return orm.client._protocol._fatalError;
                        }
                    }
                }
            }
            break;
    }
    return true;
};

exports.helpers = {
    __slice: [].slice,
    __bind: function(fn, me) {
        return function() {
            return fn.apply(me, arguments);
        };
    },
    merge: function(base, update) {
        var k, v;
        if (!base) {
            return update;
        }
        for (k in update) {
            v = update[k];
            base[k] = update[k];
        }
        return base;
    },
    reverse: function(key) {
        var hasOrder = key.match(/\s+(A|DE)SC$/i);
        if (hasOrder) {
            if (hasOrder[1] === 'DE') {
                return -1;
            }
        }
        return 1;
    },
    inArray: function(p_val, arr) {
        for (var i = 0, l = arr.length; i < l; i++) {
            if (arr[i] === p_val) {
                return true;
            }
        }
        return false;
    },
    stripOrder: function(key) {
        return key.replace(/\s+(A|DE)SC/i, '');
    },
    savePrep: function(data) {
        var id = data.id;
        if (id) {
            data._id = id.toString();
        }
        delete data.id;
        if (data._rev === null) {
            return delete data._rev;
        }
    },
    applyFilter: function(filter) {
        var self = this;
        if (typeof filter.where === 'function') {
            return filter.where;
        }
        var keys = Object.keys(filter.where);
        return function(obj) {
            var pass = true;
            keys.forEach(function(key) {
                if (typeof filter.where[key] === 'object' && !filter.where[key].getTime) {
                    pass = self.parseCond(obj[key], filter.where[key]);
                } else {
                    if (!self.testString(filter.where[key], obj[key])) {
                        pass = false;
                    }
                }
            });
            return pass;
        };
    },
    testString: function(example, value) {
        if (typeof value === 'string' && example && example.constructor.name === 'RegExp') {
            return value.match(example);
        }
        // not strict equality
        return (example !== null ? example.toString() : example) === (value !== null ? value.toString() : value);
    },
    parseCond: function(val, conds) {
        var outs = false;
        Object.keys(conds).forEach(function(condType) {
            switch (condType) {
                case 'gt':
                    outs = val > conds[condType] ? true : false;
                    break;
                case 'gte':
                    outs = val >= conds[condType] ? true : false;
                    break;
                case 'lt':
                    outs = val < conds[condType] ? true : false;
                    break;
                case 'lte':
                    outs = val <= conds[condType] ? true : false;
                    break;
                case 'between':
                    var bt = conds[condType];
                    outs = (val >= bt[0] && val <= bt[1]) ? true : false;
                    break;
                case 'inq':
                case 'in':
                    conds[condType].forEach(function(cval) {
                        if (val === cval) {
                            outs = true;
                        }
                    });
                    break;
                case 'nin':
                    outs = true;
                    conds[condType].forEach(function(cval) {
                        if (val === cval) {
                            outs = false;
                        }
                    });
                    break;
                case 'neq':
                case 'ne':
                    outs = val !== conds[condType] ? true : false;
                    break;
                case 'regex':
                case 'like':
                    outs = new RegExp(conds[condType]).test(val);
                    break;
                case 'nlike':
                    outs = !new RegExp(conds[condType]).test(val);
                    break;
                default:
                    outs = val === conds[condType] ? true : false;
                    break;
            }
        });
        return outs;
    }
};
