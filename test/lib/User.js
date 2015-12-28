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
module.exports = function (schema) {
    var User = schema.define('user', {
        active: {type: schema.Number, limit: 1, default: 0, index: true},
        language: {type: schema.String, limit: 5, default: "en"},
        provider: {type: schema.String, limit: 50, default: "password"},
        middle_initial: {type: schema.String, limit: 10},
        first_name: {type: schema.String, limit: 150, index: true},
        last_name: {type: schema.String, limit: 150, index: true},
        screen_name: {type: schema.String, limit: 150, index: true},
        email: {type: schema.String, limit: 150, index: true},
        account_type: {type: schema.Number, limit: 1},
        gender: {type: schema.String, limit: 10, default: "male"},
        birthday: {type: schema.Date},
        age: {type: schema.Number, limit: 11},
        salt: {type: schema.String, limit: 150},
        password: {type: schema.String, limit: 250},
        notes: {type: schema.Text},
        image_source: {type: schema.String, limit: 255},
        image_thumbs: {type: schema.Text},
        terms: {type: schema.Number, limit: 1},
        create_id: {type: schema.Number, limit: 1},
        modify_id: {type: schema.Number, limit: 1},
        expire_ts: {type: schema.Date},
        create_ts: {type: schema.Date},
        disable_ts: {type: schema.Date},
        modify_ts: {type: schema.Date}
    }, {});
    /* Validators */
    User.validatesPresenceOf('first_name', 'email');
    User.validatesLengthOf('password', {min: 5, message: {min: 'Password is too short'}});
    User.validatesInclusionOf('language', {in: ['en', 'ru']});
    User.validatesInclusionOf('gender', {in: ['male', 'female']});
    User.validatesExclusionOf('screen_name', {in: ['admin', 'master']});
    User.validatesFormatOf('screen_name', {with: /^\S+$/, message:"is not valid"});
    User.validatesNumericalityOf('age', {int: true});
    User.validatesUniquenessOf('email', {message: 'email is not unique'});
    var userNameValidator = function (err) {
        if (this.first_name === 'bad') { err(); }
    };
    var emailValidator = function(err){
        if(!/^[-a-z0-9!#$%&'*+/=?^_`{|}~]+(?:\.[-a-z0-9!#$%&'*+/=?^_`{|}~]+)*@(?:[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)*(?:aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|[a-z][a-z])$/.test(this.email)) { err(); }
    };
    User.validate('first_name', userNameValidator, {message: 'Bad first_name'});
    User.validate('email', emailValidator, {message: 'Bad email'});

    return User;
};