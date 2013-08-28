'use strict';

var nativeStreams = require('stream');
var util = require('util');

function EventualState(promise, stream) {
  this.promise = promise;
  this.stream = null;
  this.waiting = false;
  this.encoding = stream._readableState.encoding;
}

function EventualStream(promise) {
  nativeStreams.Readable.call(this);

  promise = promise
      .tap(this._init.bind(this))
      .tap(null, this.emit.bind(this, 'error'));
  this._eventualState = new EventualState(promise, this);
}

util.inherits(EventualStream, nativeStreams.Readable);

module.exports = EventualStream;

EventualStream.prototype._init = function(stream) {
  if (typeof stream !== 'object' || typeof stream.read !== 'function') {
    throw new TypeError();
  }

  this._eventualState.stream = stream;

  var readableState = this._readableState;
  var streamState = stream._readableState;
  readableState.highWaterMark = streamState.highWaterMark;
  readableState.objectMode = streamState.objectMode;
  if (streamState.encoding !== null && this._eventualState.encoding === null) {
    this.setEncoding(streamState.encoding);
  }

  stream.once('close', this._forwardClose.bind(this));
  stream.once('error', this._forwardError.bind(this));
};

EventualStream.prototype._forwardClose = function() {
  process.nextTick(this.emit.bind(this, 'close'));
};

EventualStream.prototype._forwardError = function(error) {
  process.nextTick(this.emit.bind(this, 'error', error));
};

EventualStream.prototype.setEncoding = function(encoding) {
  this._eventualState.encoding = encoding;
  nativeStreams.Readable.prototype.setEncoding.call(this, encoding);
};

EventualStream.prototype._read = function(size) {
  if (this._eventualState.stream) {
    this._pushChunks(size);
  } else {
    this._eventualState.promise.then(this._read.bind(this, size));
  }
};

EventualStream.prototype._pushChunks = function(size) {
  var chunk, pushAnother;
  do {
    chunk = this._eventualState.stream.read(size);
    if (chunk === null) {
      this._waitForChunks(size);
      pushAnother = false;
    } else {
      pushAnother = this.push(chunk) !== false;
    }
  } while (pushAnother);
};

EventualStream.prototype._pushNull = function() {
  this.push(null);
};

EventualStream.prototype._waitForChunks = function(size) {
  var state = this._eventualState;
  if (state.waiting) {
    return;
  }
  state.waiting = true;

  var eventual = this;
  function onReadable() {
    cleanup();
    eventual._pushChunks(size);
  }
  function onEnd() {
    cleanup();
    eventual._pushNull();
  }
  function cleanup() {
    state.waiting = false;
    state.stream.removeListener('readable', onReadable);
    state.stream.removeListener('end', onEnd);
    state.stream.removeListener('error', cleanup);
  }

  state.stream.on('readable', onReadable);
  state.stream.on('end', onEnd);
  // Normal error handling was already set up when the stream became
  // available, so we just need to clean up the other listeners.
  state.stream.on('error', cleanup);
};
