var express = require('express');
var redwrap = require('redwrap');
var MongoClient = require('mongodb').MongoClient;
var Collections = require('./collections');
var app = express();
var MONGOLAB_URI = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/test'
var collections = {};

var Writer = {
  success: function(data) {
    var out = {success: true, error: false};
    if (data) {
      out.data = data;
    }

    return out;
  },
  error: function(message) {
    var out = {success: false, error: true};
    if (message) {
      out.message = message;
    }
    return out;
  }
};

app.set('port', (process.env.PORT || 5000));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

var endpoints = [
  {endpoint: '/genres', type: 'list', key: 'genre' },
  {endpoint: '/genres/:genre', type: 'items', key: 'genre' },
  {endpoint: '/artists', type: 'list', key: 'artist' },
  {endpoint: '/artists/:artist', type: 'items', key: 'artist' },
  {endpoint: '/years', type: 'list', key: 'year' },
  {endpoint: '/years/:year', type: 'items', key: 'year' },
];

for (var i in endpoints) {
  switch (endpoints[i].type) {
    case 'list':
      (function (endpoint) {
        app.get(endpoint.endpoint, function(req, res) {
          collections.playlist.distinct(endpoint.key, function(err, doc) {
            var out = doc.map(function(item) {
              return {
                url: encodeURIComponent(item),
                name: item
              };
            });

            if (err) {
              return res.json(Writer.error(err.toString()));
            }

            return res.json(Writer.success(out));
          });
        });
      })(endpoints[i]);
      break;

    case 'items':
      (function (endpoint) {
        app.get(endpoint.endpoint, function(req, res) {
          var query = {};
          query[endpoint.key] =
            !isNaN(parseFloat(req.params[endpoint.key])) &&
            isFinite(req.params[endpoint.key]) ?
            Number(req.params[endpoint.key]) :
            req.params[endpoint.key];

          var cursor = collections.playlist.find(query);
          var data = [];
          try {
            cursor.each(function(err, doc) {
              if (doc === null) {
                res.json(Writer.success(data));
              } else {
                data.push(doc);
              }
            });
          } catch (e) {
            return res.json(Writer.error(e.toString()));
          }
        });
      })(endpoints[i]);
      break;
  }
}


var collectionsDidInit = function() {
  app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
  });
}

var mongoDbDidInit = function(error, db) {
  if (error) {
    throw new Error('Failed to init MongoDB: ' + error.toString());
    return;
  }
  collections = new Collections();
  collections.on('init', collectionsDidInit);
  collections.init(db, ['playlist']);
}

MongoClient.connect(MONGOLAB_URI, mongoDbDidInit);