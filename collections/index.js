var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();

var Collections = function(){};
Collections.prototype.__proto__ = EventEmitter.prototype;
Collections.prototype.init = function(db, collectionsMap) {

  var self = this;
  var collections = {};
  var collectionsCount = 0;

  var requestCollection = function(name) {
    db.collection(name, function(err, collection) {
      if (err) {
        console.error('Failed to get collection %s: (%s)', name, err);
        throw new Error(err);
        return;
      }

      self.emit('collection', name, collection);
    })
  }

  this.on('collection', function(name, collection) {
    collections[name] = collection;
    collectionsCount++;
    self[name] = collection;
    if (collectionsCount == collectionsMap.length) {
      self.emit('init');
    }
  });

  collectionsMap.map(requestCollection);

}

module.exports = Collections;

