var util = require('util');
var EventEmitter = require('events').EventEmitter;
var reddit = require('redwrap');
var Collections = require('../collections');

String.prototype.capitalize = function() {

    var small = "(a|an|and|as|at|but|by|en|for|if|in|of|on|or|the|to|v[.]?|via|vs[.]?)";
    var punct = "([!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]*)";

    var parts = [],
      split = /[:.;?!] |(?: |^)["Ò]/g,
      index = 0;

    while (true) {
      var m = split.exec(this);

      parts.push(this.substring(index, m ? m.index : this.length)
          .replace(/\b([A-Za-z][a-z.'Õ]*)\b/g, function(all) {
              return /[A-Za-z]\.[A-Za-z]/.test(all) ? all : upper(all);
          })
          .replace(RegExp("\\b" + small + "\\b", "ig"), lower)
          .replace(RegExp("^" + punct + small + "\\b", "ig"), function(all, punct, word) {
              return punct + upper(word);
          })
          .replace(RegExp("\\b" + small + punct + "$", "ig"), upper));

      index = split.lastIndex;

      if (m) parts.push(m[0]);
      else break;
    }

    return parts.join("").replace(/ V(s?)\. /ig, " v$1. ")
      .replace(/(['Õ])S\b/ig, "$1s")
      .replace(/\b(AT&T|Q&A)\b/ig, function(all) {
          return all.toUpperCase();
      });

    function lower(word) {
        return word.toLowerCase();
    }

    function upper(word) {
        return word.substr(0, 1).toUpperCase() + word.substr(1);
    }
}

module.exports = function(db) {
  var emitter = new EventEmitter();
  var MAX_REQUESTS_PER_MINUTE = 20;
  var MAX_DUPLICATE_COUNT = 5;
  var HALF_DAY = 43200000;
  var isCrawlerStarted = false;
  var count = -99;
  var limit = 100;
  var self = this;
  var date = null;
  var lastPostId = null;
  var firstPostId = null;
  var collectionsMap = ['app', 'music', 'playlist'];
  var collections = {};
  var methods = [];
  var isInited = false;

  var collectionsDidInit = function() {
    console.log('Music Crawler initialized.');
    isInited = true;
    collections.app.findOne({}, function(err, doc) {
      if (doc) {
        lastPostId = doc.after;
        firstPostId = doc.before;
      }

      for (var i in methods) {
        methods[i]();
      }
    });
  }

  emitter.on('idle', function(idle) {
    var currentDate = new Date().getTime();
    var maxTimeout = 60000 / MAX_REQUESTS_PER_MINUTE;
    var timeout = currentDate - date;
    var idleTimeout = idle || (timeout < maxTimeout ? maxTimeout : timeout);
    setTimeout(function() {
      emitter.emit('ready');
    }, idleTimeout);
  });

  emitter.on('data.last', function(data) {
    collections.app.update({after: {$exists: true}}, {$set: {after: data.after}}, {upsert: true});
  });

  emitter.on('data', function(data) {
    if (!data.data.children) {
      console.error('failed to get payload');
    } else {
      for (var i in data.data.children) {
        var song = normalizeTitle(data.data.children[i].data.title);
        if (song) {
          console.log('Adding: ' + JSON.stringify(song));
          song.song = data.data.children[i].data;
          collections.playlist.update({title: song.title, artist: song.artist, genre: song.genre}, song, {upsert: true}, function(err, res) {
            if (res.modifiedCount) {
              duplicateCount++;
              console.warn('Duplicate entry found');
              if (duplicateCount == MAX_DUPLICATE_COUNT) {
                console.warn('Duplicate entry threshold found. Idling for half day');
                App.idle(HALF_DAY);
              }
            } else {
              duplicateCount = 0;
            }
          });
        }
      }
      emitter.emit('data.last', data.data);
      firstPostId = data.data.before;
      lastPostId = data.data.after;
    }

    emitter.emit('idle');
  });

  var normalizeTitle = function(title) {
    title = title || '';
    var data = title.match(/^(.+)\s+\-+\s+(.+)\s+(\[(.+)\])?\s+(\((\d+)\))?$/);
    if (data !== null && data.length === 7) {
      var out = {
        artist: data[1].capitalize(),
        title: data[2].capitalize(),
        genre: data[4].replace(/,/g, '/').split('/').map(function(item) {return item.capitalize().replace(/^\s+|\s+$/g, '')}),
        year: Number(data[6])
      }
      return out;
    }

    return null;
  }

  var doCrawl = function() {
    date = new Date().getTime();
    var r = reddit.r('listentothis').limit(1000);
    if (lastPostId) {
      r = r.after(lastPostId);
    }

    r.exe(function(err, data, res) {
      if (err) {
        console.error('Crawler error: %s (data: %s, res: %s)', err.toString(), data, res);
        emitter.emit('data.last', {after: null});
        // App.stopCrawl();
        return;
      }

      if (data) {
        emitter.emit('data', data);
      }
    });
  }

  var App = {
    crawl: function() {
      if (isCrawlerStarted) {
        console.error('Crawler already running.');
        return;
      } else {
        emitter.on('ready', function() {
          doCrawl();
        });
        emitter.emit('ready');
        isCrawlerStarted = true;
        console.log('Crawler started.');
      }
    },
    idle: function() {
      if (isCrawlerStarted) {
        emitter.emit('data.last', {after: null});
        emitter.emit('idle', ONE_DAY);
      }
    },
    stopCrawl: function() {
      if (isCrawlerStarted) {
        emitter.removeAllListeners('ready');
        isCrawlerStarted = false;
      }
      console.log('Crawler stopped.');
    },
    // normalizeTitles: function() {
    //   var cursor = collections.music.find();
    //   cursor.each(function(err, doc) {
    //     if (doc) {
    //       var data = normalizeTitle(doc.data.title);
    //       if (data) {
    //         data.song = doc.data;
    //         collections.playlist.insert(data, {w: 1});
    //       }
    //     } else {
    //       process.exit();
    //     }
    //   });
    // }
  };

  var fn = function() {return this};

  for (var i in App) {
    if (typeof App[i] !== 'function') {
      continue;
    }

    fn.prototype[i] = (function(fn) {return function() {return isInited ? methods.push(fn) : fn(); }})(App[i]);
  }

  var init = function() {
    collections = new Collections();
    collections.on('init', collectionsDidInit);
    collections.init(db, collectionsMap);
  }

  init();
  return fn.prototype;

};
