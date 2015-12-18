/**
 *  Order tests
 *
 *  Created by create caminte-cli script
 *  App based on CaminteJS
 *  CaminteJS homepage http://www.camintejs.com
 **/

var fs = require('fs');
var dbDir = './db';
var onlyJs = function(file) {
   return /\.js$/.test(file);
};

/* create dir */
var dstat, tstat;
try {
    dstat = fs.statSync(dbDir);
} catch(err) {}
if(!dstat) { fs.mkdirSync(dbDir,'0755'); }
try {
    tstat = fs.statSync(dbDir + '/test');
} catch(err) {}
if(!tstat) { fs.mkdirSync(dbDir + '/test','0755'); }

/* units tests */
var units = fs.readdirSync(__dirname+'/unit').filter(onlyJs);

units.forEach(function(unit){
    require('./unit/' + unit);
});

/* models tests */
var models = fs.readdirSync(__dirname+'/model').filter(onlyJs);

models.forEach(function(model){
    require('./model/' + model);
});

/* routes tests
var routes = fs.readdirSync(__dirname+'/route').filter(onlyJs);

routes.forEach(function(route){
    require('./route/' + route);
});*/