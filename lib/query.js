/*
 * Copyright 2013 Aelxey Gordeyev <aleksej@gordejev.lv>.
 */

/**
 * Module dependencies.
 */
var utils = require('./utils');
var helpers = utils.helpers;

/**
 * Query class
 *
 * @api private
 *
 * @param {Object} model
 * @param {String} action
 * @param {mixed} conditions
 */
function Query(model, action, conditions) {
    var self = this;
    self.model = model;
    self.action = action || 'all';
    self.q = {
        conditions: {},
        params: {},
        pkey: false,
        fields: false
    };
    if (typeof conditions === 'object') {
        self.q.conditions = helpers.merge(self.q.conditions, conditions);
    }

    ['all', 'run', 'exec'].forEach(function(method) {
        self[method] = function(params, callback) {
            if (arguments.length === 1) {
                callback = params;
                params = {};
            }
            params = buildQuery(params, this);
            var action = self.action ? self.action : 'all';
            self.model[action](params, callback);
        };
    });

    ['find', 'findOne'].forEach(function(method) {
        self[method] = function(params, callback) {
            if (arguments.length === 1) {
                callback = params;
                params = {};
            }
            params = buildQuery(params, this);
            self.model[method](params, callback);
        };
    });

    ['skip', 'limit', 'order', 'sort', 'group'].forEach(function(method) {
        self[method] = function(key, value) {
            this.q.pkey = false;
            if (method === 'sort') {
                method = 'order';
            }
            if (typeof value === 'undefined') {
                if (/^-/.test(key)) {
                    this.q.params[method] = key.replace(/^-/, '') + ' DESC';
                } else {
                    this.q.params[method] = key;
                }
            } else {
                this.q.params[method] = key + ' ' + value;
            }
            return this;
        };
    });

    self.asc = function(value) {
        this.q.pkey = false;
        this.q.params['order'] = value + ' ASC';
        return this;
    };

    self.desc = function(value) {
        this.q.pkey = false;
        this.q.params['order'] = value + ' DESC';
        return this;
    };

    self.where = function(key, value) {
        if (typeof value === 'undefined') {
            this.q.pkey = key;
        } else {
            this.q.pkey = false;
            this.q.conditions[key] = value;
        }
        return this;
    };

    self.or = function(values) {
        if (Array.isArray(values)) {
            this.q.conditions['or'] = values;
        }
        return this;
    };

    self.range = function(key, from, to) {
        if (typeof to === 'undefined') {
            if (this.q.pkey) {
                to = from;
                from = key;
                if (typeof this.q.conditions[this.q.pkey] === 'undefined') {
                    this.q.conditions[this.q.pkey] = {};
                }
                this.q.conditions[this.q.pkey].gt = from;
                this.q.conditions[this.q.pkey].lt = to;
            }
        } else {
            this.q.pkey = false;
            if (typeof this.q.conditions[key] === 'undefined') {
                this.q.conditions[key] = {};
            }
            this.q.conditions[key].gt = from;
            this.q.conditions[key].lt = to;
        }
        return this;
    };

    ['gt', 'gte', 'lt', 'lte', 'in', 'inq', 'ne', 'neq', 'nin', 'regex', 'like', 'nlike', 'between'].forEach(function(method) {
        self[method] = function(key, value) {
            if (typeof value === 'undefined') {
                if (this.q.pkey) {
                    if (typeof this.q.conditions[this.q.pkey] === 'undefined') {
                        this.q.conditions[this.q.pkey] = {};
                    }
                    this.q.conditions[this.q.pkey][method] = key;
                }
            } else {
                this.q.pkey = false;
                if (typeof this.q.conditions[key] === 'undefined') {
                    this.q.conditions[key] = {};
                }
                this.q.conditions[key][method] = value;
            }
            return this;
        };
    });

    self.slice = function(values) {
        if (Array.isArray(values)) {
            if (typeof values[1] === 'undefined') {
                this.q.params['limit'] = values[0];
            } else {
                this.q.params['skip'] = values[0];
                this.q.params['limit'] = values[1];
            }
        }
        return this;
    };

    /**
     * Destroy records
     * @param {Object} params
     * @param {Function} callback
     */
    self.remove = function(params, callback) {
        if (arguments.length === 1) {
            callback = params;
            params = {};
        }
        params = buildQuery(params, this);
        self.model.remove(params, callback);
    };

    function buildQuery(opts, query) {
        if (typeof opts.where === 'undefined') {
            opts.where = {};
        }
        opts.where = helpers.merge(opts.where, query.q.conditions);
        query.q.conditions = {};

        for (var pkey in query.q.params) {
            if (typeof opts[pkey] === 'undefined') {
                opts[pkey] = {};
            }
            opts[pkey] = query.q.params[pkey];
        }

        query.q.params = {};
        query.q.pkey = false;
        return opts;
    }
}

/**
 * Exports.
 */

module.exports = exports = Query;
