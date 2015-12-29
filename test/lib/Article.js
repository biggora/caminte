/**
 *  Article schema
 *
 *  Created by create caminte-cli script
 *  App based on CaminteJS
 *  CaminteJS homepage http://www.camintejs.com
 **/

/**
 *  Define Article Model
 *  @param {Object} schema
 *  @return {Object}
 **/
module.exports = function (schema) {
    var Article = schema.define('article', {
        active: {type: schema.Number, limit: 1, default: 0, index: true},
        mainpage: {type: schema.Number, limit: 1, index: true},
        featured: {type: schema.Boolean, default: true, index: true},
        language: {type: schema.String, limit: 5, default: "en", index: true},
        category_id: {type: schema.Number, limit: 11, default: 0, index: true},
        title: {type: schema.String, limit: 155, index: true},
        alias: {type: schema.String, limit: 155, index: true},
        content_short: {type: schema.Text},
        content_full: {type: schema.Text},
        image_source: {type: schema.String, limit: 255},
        image_thumbs: {type: schema.Text},
        video_source: {type: schema.String, limit: 255},
        video_thumbs: {type: schema.Text},
        template: {type: schema.String, limit: 255, default: "default"},
        params: {type: schema.Json},
        longitude: {type: schema.Double},
        latitude: {type: schema.Real},
        price: {type: schema.Float},
        create_ts: {type: schema.Date, default: Date.now},
        modify_ts: {type: schema.Date},
        create_id: {type: schema.Number, limit: 21, index: true},
        modify_id: {type: schema.Number, limit: 21, index: true},
        meta_keys: {type: schema.Json},
        meta_desc: {type: schema.String, limit: 155}
    }, {});

    /* Validators */
    Article.validatesPresenceOf('title', 'alias');
    Article.validatesLengthOf('title', {min: 5, message: {min: 'title is too short'}});
    Article.validatesInclusionOf('language', {in: ['en', 'ru']});
    Article.validatesNumericalityOf('category_id', {int: true});
    Article.validatesUniquenessOf('alias', {message: 'alias is not unique'});

    return Article;
};