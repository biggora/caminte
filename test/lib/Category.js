/**
 *  Category schema
 *
 *  Created by create caminte-cli script
 *  App based on CaminteJS
 *  CaminteJS homepage http://www.camintejs.com
 **/

/**
 *  Define Category Model
 *  @param {Object} schema
 *  @return {Object}
 **/
module.exports = function (schema) {
    var Category = schema.define('category', {
        active: {type: schema.Number, 'default': 0, limit: 1, index: true},
        section: {type: schema.String, limit: 20, 'default': "product", index: true},
        language: {type: schema.String, limit: 5, 'default': "en", index: true},
        title: {type: schema.String, limit: 155},
        description: {type: schema.String, limit: 255},
        translation: {type: schema.Text},
        category_id: {type: schema.Number, 'default': 0, limit: 11, index: true},
        sort_order: {type: schema.Number, limit: 11, 'default': 1},
        image_source: {type: schema.String, limit: 255},
        image_thumbs: {type: schema.Text},
        meta_keys: {type: schema.String, limit: 155},
        meta_desc: {type: schema.String, limit: 155},
        childs: {type: schema.Number, limit: 11},
        create_id: {type: schema.Number, limit: 21},
        modify_id: {type: schema.Number, limit: 21},
        create_ts: {type: schema.Date, 'default': Date.now},
        modify_ts: {type: schema.Date}
    }, {});
    /* Validators */
    Category.validatesPresenceOf('title', 'section');
    Category.validatesLengthOf('title', {min: 5, message: {min: 'title is too short'}});
    Category.validatesLengthOf('section', {min: 5, message: {min: 'section is too short'}});
    Category.validatesInclusionOf('language', {in: ['en', 'ru', 'lv', 'es']});
    Category.validatesNumericalityOf('category_id', {int: true});
    /* Scopes */
    Category.scope('published', {active: 1});
    Category.scope('hidden', {active: 0});
    Category.scope('products', {section: 'product'});

    return Category;
};