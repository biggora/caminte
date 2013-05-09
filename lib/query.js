/*
 * The MIT License
 *
 * Copyright 2013 Aelxey Gordeyev <aleksej@gorrdejev.lv>.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * Module dependencies.
 */


/**
 * Query class
 *
 * @api private
 */

function Query (model) {
    var self = this;
    self.model = model;
    self.q = {
        conditions : {},
        params : {},
        pkey : false,
        fields : false
    };

    ['run','all','find','findOne'].forEach(function(method){
        self[method] = function (params, callback) {
            if (arguments.length === 1) {
                callback = params;
                params = {};
            }
            params = buildQuery(params, this);
            self.model[method](params, callback);
        }
    });

    ['skip','limit','order','sort'].forEach(function(method){
        self[method] = function (key, value) {
            this.q.pkey = false;
            if(method == 'sort') {
                method = 'order';
            }
            if(typeof value === 'undefined') {
                if(/^-/.test(key)) {
                    this.q.params[method] = key.replace(/^-/,"") + ' DESC';
                } else {
                    this.q.params[method] = key;
                }
            } else {
                this.q.params[method] = key + ' ' + value;
            }
            return this;
        };
    });

    self.asc = function (value) {
        this.q.pkey = false;
        this.q.params['order'] = value + ' ASC';
        return this;
    };

    self.desc = function (value) {
        this.q.pkey = false;
        this.q.params['order'] = value + ' DESC';
        return this;
    };

    self.where = function (key, value) {
        if(typeof value === 'undefined') {
            this.q.pkey = key;
        } else {
            this.q.pkey = false;
            this.q.conditions[key] = value;
        }
        return this;
    };

    ['gt','gte','lt','lte','in','inq','ne','neq','nin','regex','like','nlike','between'].forEach(function(method){
        self[method] = function (key, value) {
            if(typeof value === 'undefined') {
                if(this.q.pkey) {
                    if(typeof this.q.conditions[this.q.pkey] == 'undefined') {
                        this.q.conditions[this.q.pkey] = {};
                    }
                    this.q.conditions[this.q.pkey][method] = key;
                }
            } else {
                this.q.pkey = false;
                if(typeof this.q.conditions[key] == 'undefined') {
                    this.q.conditions[key] = {};
                }
                this.q.conditions[key][method] = value;
            }
            return this;
        };
    });

    function buildQuery(opts, query) {

        for (var okey in query.q.conditions) {
            if(typeof opts.where == 'undefined') {
                opts.where = {};
            }
            opts.where[okey] = query.q.conditions[okey];
        }
        query.q.conditions = {};

        for (var pkey in query.q.params) {
            if(typeof opts[pkey] == 'undefined') {
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