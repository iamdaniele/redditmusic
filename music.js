var MongoClient = require('mongodb').MongoClient;
var reddit = require('redwrap');
var Crawler = require('./music-crawler');

var MONGOLAB_URI = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/test'
new (function() {
  var collection = null;
  var crawler = null;

  var mongoDbDidInit = function(error, db) {
    if (error) {
      console.error('Failed to init MongoDB: ' + error.toString());
      process.exit();
      return;
    }
    crawler = new Crawler(db);
    crawler.crawl();
  }

  var init = function() {
    MongoClient.connect(MONGOLAB_URI, mongoDbDidInit);
  }

  init();
})();

