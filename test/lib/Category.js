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
module.exports = function(schema){
    var Category = schema.define('category', {
         active: { type: schema.Number, limit: 1 },
         section: { type: schema.String, limit: 20, default: "product", index: true },
         category_id: { type: schema.Number, limit: 11 },
         sort_order: { type: schema.Number, limit: 11, default: 1 },
         title: { type: schema.String, limit: 155 },
         description: { type: schema.String, limit: 255 },
         translation: { type: schema.Text },
         extra_category_id: { type: schema.Number, limit: 11 },
         image_source: { type: schema.String, limit: 255 },
         image_thumbs: { type: schema.Text },
         meta_keys: { type: schema.String, limit: 155 },
         meta_desc: { type: schema.String, limit: 155 },
         childs: { type: schema.Number, limit: 11 },
         create_id: { type: schema.Number, limit: 21 },
         modify_id: { type: schema.Number, limit: 21 },
         create_ts: { type: schema.Date },
         modify_ts: { type: schema.Date }
    },{});
    return Category;
};