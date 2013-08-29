'use strict';

var Promise = require('legendary').Promise;
var Collection = require('legendary').Collection;

var blessed = require('legendary/lib/blessed');
var helpers = require('legendary/lib/_helpers');
var trampoline = require('legendary/lib/trampoline');

var events = require('events');
var nativeStreams = require('stream');

var EventualStream = require('./EventualStream');
var EndOfStreamError = require('./EndOfStreamError');

function ReadableState() {
  this.stream = null;
  this.waiting = null;
  this.readable = false;
  this.reachedEnd = false;
}

// Readable promises the ending or erroring of a stream.
//
// Provides helper methods for actually reading the stream, which return
// Promises or new Readables.
//
// Cancelling a Readable signals a lack of interest in the stream outcome,
// but does not discard the stream. Cancelling a returned Readable will stop
// the read from the original stream that is producing the data for the
// now-cancelled Readable.
//
// Implements the EventEmitter interface but only emits `close`, when the
// underlying stream is closed.

function Readable(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof Readable)) {
    return new Readable(resolver);
  }

  events.EventEmitter.call(this);

  this._readableState = new ReadableState();
  if (resolver !== blessed.be) {
    this._bless(resolver, true);
  }
}

module.exports = blessed.extended(Readable);

Object.keys(events.EventEmitter.prototype).forEach(function(method) {
  if (!Readable.prototype[method]) {
    Readable.prototype[method] = events.EventEmitter.prototype[method];
  }
});

var PRODUCE_CHUNK_INSTEAD = Readable.prototype._PRODUCE_CHUNK_INSTEAD_ = {};

function nextTurn(func, value) {
  trampoline.nextTurn({
    resolve: function() {
      func(value);
    }
  });
}

function invokeCancel(promise) {
  promise.cancel();
}

function produceMapped(result) {
  if (result === null || typeof result === 'undefined') {
    throw new TypeError('Stream iterators must return a non-null and ' +
        'non-undefined value.');
  }

  return true;
}

function produceFiltered(result) {
  return result && PRODUCE_CHUNK_INSTEAD;
}

function produceFilteredOut(result) {
  return !result && PRODUCE_CHUNK_INSTEAD;
}

// Override from() and rejected() because we *must* instantiate a new
// Readable, not a ResolutionPropagator.
Readable.from = function(value) {
  /*jshint newcap:false*/
  return new this(function(resolve) {
    resolve(value);
  });
};

// For the same reason override #fork() and #uncancellable().
Readable.prototype.fork = function() {
  var underlyingStream = this._readableState.stream;
  var forked = new this.constructor(blessed.be);
  forked._bless(function(resolve) {
    resolve(underlyingStream);
  }, true);
  return forked;
};

Readable.prototype.uncancellable = function() {
  var underlyingStream = this._readableState.stream;
  var forked = new this.constructor(blessed.be);
  forked._bless(function(resolve) {
    resolve(underlyingStream);
  }, false);
  return forked;
};

Readable.prototype._bless = function(resolver, cancellable) {
  var state = this._readableState;
  var forwardClose = this._forwardClose.bind(this);

  blessed.be(this, function(resolve, reject) {
    function onEnd() {
      state.readable = false;
      state.reachedEnd = true;
      resolve();
    }
    function onError(error) {
      state.readable = false;
      reject(error);
    }
    function assimilateStream(stream) {
      if (typeof stream !== 'object' || typeof stream.read !== 'function') {
        throw new TypeError();
      }

      state.stream = stream;
      state.readable = true;

      stream.once('close', forwardClose);
      stream.once('error', onError);
      stream.once('end', onEnd);
    }

    // Use the resolver to get a stream, assimilate synchronously if possible
    // to avoid needlessly creating an EventualStream.
    var promise = new Promise(function(resolveInner, rejectInner) {
      return resolver(function(value) {
        if (!state.stream && !Promise.isInstance(value)) {
          assimilateStream(value);
        } else {
          resolveInner(value);
        }
      }, rejectInner);
    });

    if (!state.stream) {
      assimilateStream(new EventualStream(promise));
    }

    return function() {
      state.stream.removeListener('close', forwardClose);
      state.stream.removeListener('error', onError);
      state.stream.removeListener('end', onEnd);

      state.readable = false;
      if (state.waiting) {
        state.waiting.cancel();
      }

      promise.cancel();
    };
  }, cancellable, Promise);
};

Readable.prototype._getUnderlyingStreamState = function() {
  return this._readableState.stream._readableState;
};

Readable.prototype._forwardClose = function() {
  process.nextTick(this.emit.bind(this, 'close'));
};

Readable.prototype._produceLimited = function(maxConcurrent, iterator,
    produce, options) {

  if (!options) {
    var streamState = this._getUnderlyingStreamState();
    options = {
      encoding: streamState.encoding,
      objectMode: streamState.objectMode
    };
  }

  var output = new nativeStreams.Readable(options);
  var iteration = null;

  var pushQueue = [];
  var backpressure, resume;
  function pushResult(result, chunk) {
    var pushable = produce(result);
    if (pushable === PRODUCE_CHUNK_INSTEAD) {
      result = chunk;
    }

    if (pushable && !output.push(result)) {
      if (!backpressure) {
        backpressure = new Promise(function(resolve) {
          resume = function() {
            backpressure = resume = null;
            resolve();
          };
        });
      }
      return backpressure;
    }
  }
  function pushNull() {
    output.push(null);
  }

  var eachLimited = this.eachLimited.bind(this, maxConcurrent, function(chunk) {
    var result = iterator(chunk);
    // Ensure cancellation is propagated to the iterator result if necessary.
    if (Promise.isInstance(result)) {
      iteration.alsoCancels(result);
    }

    var pending = Promise.all(pushQueue)
        .yield(result)
        .then(function(result) {
          return pushResult(result, chunk);
        }).ensure(function() {
          pushQueue.splice(pushQueue.indexOf(pending), 1);
        });

    pushQueue.push(pending);
    return pending;
  });
  var emitError = output.emit.bind(output, 'error');

  output._read = function() {
    if (resume) {
      resume();
    } else if (!iteration) {
      iteration = eachLimited().then(pushNull).otherwise(emitError);
    }
  };

  return new this.constructor(function(resolve) {
    resolve(output);
    return function() {
      if (iteration) {
        iteration.cancel();
      }
    };
  });
};

Readable.prototype.setEncoding = function(encoding) {
  this._readableState.stream.setEncoding(encoding);
};

// For unshift() Node will emit errors on the stream, but if the
// Readable promise has already fulfilled/rejected that error will be lost.
// Instead, assuming the error is emitted synchronously, throw
// it synchronously.
function syncThrowUnshift(stream, chunk) {
  var errorValue = syncThrowUnshift;
  function observeError(error) {
    errorValue = error;
  }
  stream.on('error', observeError);
  var returnValue;
  try {
    returnValue = stream.unshift(chunk);
  } catch (error) {
    errorValue = error;
  } finally {
    stream.removeListener('error', observeError);
  }
  if (errorValue !== syncThrowUnshift) {
    throw errorValue;
  }
  return returnValue;
}

Readable.prototype.unshift = function(chunk) {
  return syncThrowUnshift(this._readableState.stream, chunk);
};

Readable.prototype.pipe = function(dest, options) {
  return this._readableState.stream.pipe(dest, options);
};

Readable.prototype.read = function(size) {
  var readable = this;
  var state = this._readableState;
  if (!state.readable) {
    return Promise.rejected(new Error('Stream is not readable.'));
  }
  if (state.waiting) {
    return state.waiting.then(function() {
      return readable.read(size);
    });
  }

  var chunk = state.stream.read(size);
  if (chunk !== null) {
    return Promise.from(chunk);
  }

  state.waiting = new Promise(function(resolve, reject) {
    var stream = state.stream;

    function onReadable() {
      // `readable` may be emitted right before the stream ends, so wait
      // a tick, allowing the `end` event to overtake.
      process.nextTick(function() {
        cleanup();
        resolve(readable.read(size));
      });
    }
    function onEnd() {
      cleanup();
      reject(new EndOfStreamError());
    }
    function onError(reason) {
      cleanup();
      reject(reason);
    }
    function cleanup() {
      state.waiting = null;
      stream.removeListener('readable', onReadable);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    }

    stream.on('readable', onReadable);
    stream.on('end', onEnd);
    stream.on('error', onError);

    return cleanup;
  });

  return state.waiting;
};

Readable.prototype.eachLimited = function(maxConcurrent, iterator) {
  var state = this._readableState;
  if (!state.readable) {
    return Promise.rejected(new Error('Stream is not readable.'));
  }
  if (typeof maxConcurrent !== 'number') {
    return Promise.rejected(new TypeError('Missing max concurrency number.'));
  }
  if (typeof iterator !== 'function') {
    return Promise.rejected(new TypeError('Missing iterator function.'));
  }

  var readable = this;
  return new Promise(function(resolve, reject) {
    var pendingPromises = [];

    var stopIteration = false;
    var running = 0;
    function oneCompleted() {
      running--;
      runConcurrent();
    }
    function oneFailed(reason) {
      if (!stopIteration) {
        stopIteration = true;
        running = -1;
        reject(reason);
      }
    }
    function checkEnd(reason) {
      if (reason instanceof EndOfStreamError) {
        stopIteration = true;
      } else {
        throw reason;
      }
    }
    function runConcurrent() {
      if (stopIteration || state.reachedEnd) {
        if (running === 0) {
          resolve(readable);
        }
        return;
      }

      if (running >= maxConcurrent) {
        return;
      }

      running++;
      var chunk = state.stream.read();
      var result;
      if (chunk === null) {
        result = readable.read().then(iterator, checkEnd);
      } else {
        try {
          result = iterator(chunk);
        } catch (error) {
          oneFailed(error);
        }
      }

      if (Promise.isInstance(result)) {
        var pending = result.then(oneCompleted, oneFailed).ensure(function() {
          pendingPromises.splice(pendingPromises.indexOf(pending), 1);
        });
        pendingPromises.push(pending);
      } else {
        oneCompleted();
      }

      if (!state.waiting) {
        runConcurrent();
      }
    }

    nextTurn(runConcurrent);

    return function() {
      stopIteration = true;
      running = -1;
      pendingPromises.slice().forEach(invokeCancel);
    };
  });
};

Readable.prototype.each = function(iterator) {
  return this.eachLimited(Infinity, iterator);
};

Readable.prototype.eachSeries = function(iterator) {
  return this.eachLimited(1, iterator);
};

Readable.prototype.mapLimited = function(maxConcurrent, iterator, options) {
  return this._produceLimited(maxConcurrent, iterator, produceMapped, options);
};

Readable.prototype.map = function(iterator, options) {
  return this.mapLimited(Infinity, iterator, options);
};

Readable.prototype.mapSeries = function(iterator, options) {
  return this.mapLimited(1, iterator, options);
};

Readable.prototype.filterLimited = function(maxConcurrent, iterator) {
  return this._produceLimited(maxConcurrent, iterator, produceFiltered);
};

Readable.prototype.filter = function(iterator) {
  return this.filterLimited(Infinity, iterator);
};

Readable.prototype.filterSeries = function(iterator) {
  return this.filterLimited(1, iterator);
};

Readable.prototype.filterOutLimited = function(maxConcurrent, iterator) {
  return this._produceLimited(maxConcurrent, iterator, produceFilteredOut);
};

Readable.prototype.filterOut = function(iterator) {
  return this.filterOutLimited(Infinity, iterator);
};

Readable.prototype.filterOutSeries = function(iterator) {
  return this.filterOutLimited(1, iterator);
};

Readable.prototype.foldl = function(memo, iterator) {
  if (Promise.isInstance(memo)) {
    var readable = this;
    return Promise.from(memo).then(function(memo) {
      return readable.foldl(memo, iterator);
    });
  }

  return this.eachSeries(function(chunk) {
    memo = iterator(memo, chunk);
    if (Promise.isInstance(memo)) {
      return memo.then(function(value) {
        memo = value;
      });
    }
  }).then(function() {
    return memo;
  });
};

Readable.prototype.detectLimited = function(maxConcurrent, iterator) {
  return this.eachLimited(maxConcurrent, helpers.shortcutDetect(iterator))
      .then(helpers.makeUndefined, helpers.extractShortcutValue);
};

Readable.prototype.detect = function(iterator) {
  return this.detectLimited(Infinity, iterator);
};

Readable.prototype.detectSeries = function(iterator) {
  return this.detectLimited(1, iterator);
};

Readable.prototype.someLimited = function(maxConcurrent, iterator) {
  return this.eachLimited(maxConcurrent, helpers.shortcutSome(iterator))
      .then(helpers.strictlyTrue, helpers.extractShortcutValue);
};

Readable.prototype.some = function(iterator) {
  return this.someLimited(Infinity, iterator);
};

Readable.prototype.someSeries = function(iterator) {
  return this.someLimited(1, iterator);
};

Readable.prototype.everyLimited = function(maxConcurrent, iterator) {
  return this.eachLimited(maxConcurrent, helpers.shortcutNotEvery(iterator))
      .then(helpers.makeTrue, helpers.extractShortcutValue);
};

Readable.prototype.every = function(iterator) {
  return this.everyLimited(Infinity, iterator);
};

Readable.prototype.everySeries = function(iterator) {
  return this.everyLimited(1, iterator);
};

Readable.prototype.toCollection = function(constructor) {
  var arr = [];
  return this.eachSeries(function(chunk) {
    arr.push(chunk);
  }).yield(arr).to(constructor || Collection);
};
