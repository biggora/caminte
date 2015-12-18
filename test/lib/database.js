/**
 *  Default database configuration file
 *
 *  Created by create caminte-cli script
 *  App based on CaminteJS
 *  CaminteJS homepage http://www.camintejs.com
 *
 *  docs: https://github.com/biggora/caminte/wiki/Connecting-to-DB#connecting
 **/

module.exports.memory = {
    driver     : ':memory:'
};

module.exports.sqlite = {
    driver     : 'sqlite3',
    database   : './db/test.db'
};

module.exports.mysql = {
    driver     : 'mysql',
    host       : '127.0.0.1',
    port       : '3306',
    username   : 'test',
    password   : 'test',
    database   : 'test',
    autoReconnect : true
};

module.exports.postgres = {
    driver     : 'postgres',
    host       : '127.0.0.1',
    port       : '5432',
    username   : 'test',
    password   : 'test',
    database   : 'test'
};

module.exports.firebird = {
    driver     : 'firebird',
    host       : '127.0.0.1',
    port       : '3050',
    username   : 'test',
    password   : 'test',
    database   : 'test'
};

module.exports.redis = {
    driver     : 'redis',
    host       : '127.0.0.1',
    port       : '6379',
    username   : 'test',
    password   : 'test',
    database   : 'test'
};

module.exports.mongo = {
    driver     : 'mongo',
    host       : '127.0.0.1',
    port       : '27017',
    database   : 'test'
};

module.exports.tingo = {
    driver     : 'tingodb',
    database   : './db/test'
};

module.exports.rethinkdb = {
    driver     : 'rethinkdb',
    host       : '127.0.0.1',
    port       : '28015',
    database   : 'test'
};

module.exports.neo4j = {
    driver     : 'neo4j',
    host       : '127.0.0.1',
    port       : '7474',
    database   : 'test'
};