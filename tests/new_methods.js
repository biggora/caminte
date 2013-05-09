var caminte = require('../index');
var Schema = caminte.Schema,

db = {
    driver     : "mysql",
    host       : "localhost",
    port       : "3306",
    username   : "test",
    password   : "test",
    database   : "test"
};

var schema = new Schema(db.driver, db);

// simplier way to describe model
var Product = schema.define('product', {
    id : {
        type: Number
    },
    title : {
        type: String
    },
    featured : {
        type: Boolean
    },
    catalogue : {
        type: Boolean
    },
    active : {
        type: Number
    },
    original_item_link : {
        type: String
    },
    image_path : {
        type: String
    },
    product_price : {
        type: Number
    },
    shop_id : {
        type: Number
    },
    in_stock : {
        type: Number
    },
    manufacturer_id : {
        type: Number
    },
    manufacturer_name : {
        type: String
    },
    model_name : {
        type: String
    },
    category_alias_id : {
        type: Number
    },
    original_category_name : {
        type: String
    },
    original_category_full : {
        type: String
    },
    original_category_link : {
        type: String
    },
    created_ts : {
        type: Date
    },
    updated_ts : {
        type: Date
    },
    product_uid : {
        type: Number
    },
    updated_uid : {
        type: Number
    }
});

var Query = Product.find();
console.log('Query', Query);
Query.skip(10);
Query.limit(10);
Query.asc('id');
Query.run(function(err, inst){
    console.log(err, inst);
});
/*
Product.all({limit:10},function(err, inst){
  //  console.log(err, inst);
});*/