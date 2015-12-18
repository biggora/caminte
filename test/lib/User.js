/**
 *  User schema
 *
 *  Created by create caminte-cli script
 *  App based on CaminteJS
 *  CaminteJS homepage http://www.camintejs.com
 **/

/**
 *  Define User Model
 *  @param {Object} schema
 *  @return {Object}
 **/
module.exports = function(schema){
    var User = schema.define('user', {
         active: { type: schema.Number, limit: 1, default: -1, index : true },
         language: { type: schema.String, limit: 5, default: "en" },
         provider: { type: schema.String, limit: 50, default: "password" },
         middle_initial: { type: schema.String, limit: 10 },
         first_name: { type: schema.String, limit: 150, index : true },
         last_name: { type: schema.String, limit: 150, index : true },
         screen_name: { type: schema.String, limit: 150, index: true },
         email: { type: schema.String, limit: 150, index: true },
         account_type: { type: schema.Number, limit: 1 },
         gender: { type: schema.String, limit: 10, default: "male" },
         birthday: { type: schema.Date },
         age: { type: schema.Number, limit: 11 },
         salt: { type: schema.String, limit: 150 },
         password: { type: schema.String, limit: 250 },
         address: { type: schema.Text },
         mailing: { type: schema.Text },
         params: { type: schema.Text },
         notes: { type: schema.Text },
         expire_ts: { type: schema.Date },
         create_ts: { type: schema.Date },
         disable_ts: { type: schema.Date },
         modify_ts: { type: schema.Date },
         image_source: { type: schema.String, limit: 255 },
         image_thumbs: { type: schema.Text },
         terms: { type: schema.Number, limit: 1 },
         create_id: { type: schema.Number, limit: 1 },
         modify_id: { type: schema.Number, limit: 1 }
    },{});
    return User;
};