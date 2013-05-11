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
        type: String
    },
    updated_uid : {
        type: Number
    }
});
/*
*/
var Query1 = Product.find({'id' : { ne : 11 } });
Query1.range('id', 10, 20);
Query1.asc('id');
Query1.all(function(err, inst){
   // console.log(err, inst);
   inst.forEach(function(ins){
       console.log(ins.id);
   })
   console.log('Query1');
});

Product.findOne({order:"id ASC"},function(err, inst){
    // console.log(err, inst);
    console.log('Query3', inst.id);
});

/**/
Product.find().where('id').gt(100).lt(150).limit(10).asc('id').run(function(err, inst){
    // console.log(err, inst);
    console.log('Query2');
});

var und = { id: 12,
  title: 'TACX Pudeles turētājs Tacx SaddleClamp T6202',
  featured: 0,
  catalogue: 0,
  active: 1,
  original_item_link: 'http://www.2rati.lv/lat/catalogue/aksessuari/5295.html',
  image_path: 'http://www.2rati.lv/thjpeg100.php?i=595_1_2',
  product_price: 7.65,
  shop_id: 2,
  in_stock: 0,
  manufacturer_id: 0,
  manufacturer_name: 'Nav norādīts',
  model_name: 'Nav norādīts',
  category_alias_id: 1,
  original_category_name: 'Aksesuāri',
  original_category_full: 'Aksesuāri',
  original_category_link: 'http://www.2rati.lv/lat/catalogue/aksessuari.html',
  product_uid: "be77275ebb2f5dbd28731af08ee3c5c76a7fd1d7bbb0cf4c5147a120de62b74b99605305822896e0c3a79f14d8f3ab6c09792bf4a1b0d2813ca0621849",
  updated_uid: 0
}

/*
Product.findOrCreate(und, function(err){
    if(err) {
        console.log(err);
    }
    console.log('Query findOrCreate');
});

Product.findById(12, function(err, inst){
    if(err) {
        console.log(err);
    }
    console.log('Query findById: ', err, inst ? inst.id : null);
});

Product.destroyById(12, function(err){
    if(err) {
        console.log(err);
    }
    console.log('Query destroyById');
});
*/

Product.all({limit:10},function(err, inst){
   inst.forEach(function(ins){
       console.log(ins.id);
   })
   console.log('all');
});
// arguments