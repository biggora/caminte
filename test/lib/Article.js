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
module.exports = function(schema){
    var Article = schema.define('article', {
         active: { type: schema.Number, limit: 1, index : true },
         mainpage: { type: schema.Number, limit: 1, index : true },
         language: { type: schema.String, limit: 5, default: "en", index : true },
         category_id: { type: schema.Number, limit: 11, index : true },
         title: { type: schema.String, limit: 155, index: true },
         alias: { type: schema.String, limit: 155, index: true },
         content_short: { type: schema.Text },
         content_full: { type: schema.Text },
         image_source: { type: schema.String, limit: 255 },
         image_thumbs: { type: schema.Text },
         video_source: { type: schema.String, limit: 255 },
         video_thumbs: { type: schema.Text },
         template: { type: schema.String, limit: 255, default: "default" },
         params: { type: schema.Text },
         create_ts: { type: schema.Date },
         modify_ts: { type: schema.Date },
         create_id: { type: schema.Number, limit: 21 },
         modify_id: { type: schema.Number, limit: 21 },
         meta_keys: { type: schema.String, limit: 155 },
         meta_desc: { type: schema.String, limit: 155 }
    },{});
    return Article;
};