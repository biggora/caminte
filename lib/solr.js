/**
 * Created by Alex on 5/24/2014.
 */

exports.toSolr = function toSolr(params) {
    params = params ? params : {};

    Object.keys(params).forEach(function(key){
        console.log(key);
    });

    try {

    } catch (e) {
        // console.log(e)

    }
};

exports.fromSolr = function fromSolr(str) {

};

exports.__applyFilter = function(filter) {
    var self = this;
    if (typeof filter.where === 'function') {
        return filter.where;
    }
    var keys = Object.keys(filter.where);
    return function(obj) {
        var pass = [];
        keys.forEach(function(key) {
            if (typeof filter.where[key] === 'object' && !filter.where[key].getTime) {
                pass.push(self.parseCond(obj[key], filter.where[key]));
            } else {
                pass.push(key + ':' + filter.where[key]);
            }
        });
        return pass;
    };
};

exports.__parseCond = function(val, conds) {
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
                // need
                outs = val !== conds[condType] ? true : false;
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
};