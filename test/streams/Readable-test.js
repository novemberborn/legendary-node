'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('legendary/test/sentinels');
var util = require('legendary/test/util');

var Promise = require('../../').Promise;
var Collection = require('../../').Collection;
var CancellationError = require('../../').CancellationError;
var EndOfStreamError = require('../../').streams.EndOfStreamError;
var Readable = require('../../').streams.Readable;
var EventualStream = require('../../lib/streams/EventualStream');
var delay = require('../../').timed.delay;

var blessed = require('legendary/lib/blessed');

var PassThrough = require('stream').PassThrough;
var StreamArray = require('stream-array');
var randomBytes = require('crypto').randomBytes;

function identity(x) {
  return x;
}

function thrower(x) {
  throw x;
}

function constant(x) {
  return function() {
    return x;
  };
}

function assertCancelled(promise) {
  return assert.isRejected(promise, CancellationError);
}

function assertErrorMessage(promise, message) {
  return assert.isRejected(promise).then(function() {
    return promise.then(null, function(reason) {
      assert.instanceOf(reason, Error);
      assert.equal(reason.message, message);
    });
  });
}

describe('streams.Readable', function() {
  util.testConstructor(Readable);

  describe('has a special resolver', function() {
    it('assimilates a synchronous stream value', function() {
      var pt = new PassThrough();
      var r = new Readable(function(resolve) {
        resolve(pt);
      });
      assert.strictEqual(r._readableState.stream, pt);
      assert.isTrue(r._readableState.readable);
    });

    it('assimilates an asynchronous stream value', function() {
      var r = new Readable(function(resolve) {
        Promise.from(new PassThrough()).then(resolve);
      });
      assert.instanceOf(r._readableState.stream, EventualStream);
      assert.isTrue(r._readableState.readable);
    });

    it('assimilates a promise for a stream value', function() {
      var r = new Readable(function(resolve) {
        resolve(Promise.from(new PassThrough()));
      });
      assert.instanceOf(r._readableState.stream, EventualStream);
      assert.isTrue(r._readableState.readable);
    });

    it('rejects when resolver throws', function() {
      var r = new Readable(function() {
        throw sentinels.one;
      });
      return assert.isRejected(r, sentinels.Sentinel);
    });

    it('rejects when resolver rejects', function() {
      var r = new Readable(function(_, reject) {
        reject(sentinels.one);
      });
      return assert.isRejected(r, sentinels.Sentinel);
    });

    it('rejects when assimilated promise rejects', function() {
      var r = new Readable(function(resolve) {
        resolve(Promise.rejected(sentinels.one));
      });
      return assert.isRejected(r, sentinels.Sentinel);
    });

    it('rejects when assimilating a non-stream value', function() {
      var r = new Readable(function(resolve) {
        resolve();
      });
      return assert.isRejected(r, TypeError);
    });

    it('still invokes `onCancelled`', function() {
      var spy = sinon.spy();
      var r = new Readable(constant(spy));
      r.cancel();
      assert.calledOnce(spy);
    });
  });

  it('rejects when assimilated stream errors', function() {
    var pt = new PassThrough();
    var r = Readable.from(pt);
    pt.emit('error', sentinels.one);
    return assert.isRejected(r, sentinels.Sentinel);
  });

  it('forwards `close` when assimilated stream emits it', function() {
    var pt = new PassThrough();
    var r = Readable.from(pt);

    var spy = sinon.spy();
    r.on('close', spy);

    pt.emit('close');
    return delay().then(function() {
      assert.calledOnce(spy);
    });
  });

  it('fulfills when assimilated stream ends', function() {
    var pt = new PassThrough();
    var r = Readable.from(pt);
    pt.end();
    r.read();
    return assert.eventually.isUndefined(r);
  });
});

describe('streams.Readable.from()', function() {
  it('creates a Readable', function() {
    var r = Readable.from(new PassThrough());
    assert.instanceOf(r, Readable);
  });
});

describe('streams.Readable.rejected()', function() {
  it('creates a rejected Readable', function() {
    var r = Readable.rejected(sentinels.one);
    assert.instanceOf(r, Readable);
    return assert.isRejected(r, sentinels.Sentinel);
  });
});

describe('streams.Readable#fork()', function() {
  it('creates a new Readable that does not propagate cancellation',
    function() {
      var spy = sinon.spy();
      var readable = new Readable(constant(spy));
      var forked = readable.fork();
      assert.instanceOf(forked, Readable);
      forked.cancel();
      return assertCancelled(forked).then(function() {
        assert.notCalled(spy);
      });
    });
});

describe('streams.Readable#uncancellable()', function() {
  it('creates a new Readable that cannot be cancelled', function() {
    var pt = new PassThrough({ objectMode: true });
    var uncancellable = Readable.from(pt).uncancellable();
    assert.instanceOf(uncancellable, Readable);
    pt.write(sentinels.one);
    return assert.eventually.strictEqual(uncancellable.read(), sentinels.one);
  });

  it('creates a new Readable that does not propagate cancellation',
    function() {
      var spy = sinon.spy();
      var readable = new Readable(constant(spy));
      var uncancellable = readable.uncancellable();
      uncancellable.cancel();
      assert.notCalled(spy);
    });

  it('creates a new Readable, of which derived promises can’t be ' +
    'cancelled either',
    function() {
      var readable = Readable.from(new PassThrough({ objectMode: true }));
      var uncancellable = readable.uncancellable();
      var derived = uncancellable.then();

      var spy = sinon.spy();
      derived.cancel();
      derived.ensure(spy);

      return delay().then(function() {
        assert.notCalled(spy);
      });
    });
});

describe('streams.Readable#then()', function() {
  it('returns a Promise, not a Readable', function() {
    var p = Readable.from(Promise.from()).then(identity);
    assert.instanceOf(p, Promise);
    assert.notInstanceOf(p, Readable);
  });

  it('doesn’t return the readable when called without arguments', function() {
    var r = Readable.from(Promise.from());
    assert.notStrictEqual(r.then(), r);
  });
});

describe('streams.Readable#setEncoding()', function() {
  it('works as expected', function() {
    var pt = new PassThrough();
    var r = Readable.from(pt);
    r.setEncoding('hex');
    pt.end(new Buffer('foo', 'utf8'));
    return assert.eventually.equal(r.read(), '666f6f');
  });
});

describe('streams.Readable#unshift()', function() {
  it('works as expected', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);
    r.unshift(sentinels.one);
    return assert.eventually.strictEqual(r.read(), sentinels.one);
  });

  it('throws if stream is in a funny state', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);
    r.read();
    pt.end();
    return delay().then(function() {
      assert.throws(function() {
        r.unshift(sentinels.one);
      }, Error);
    });
  });
});

describe('streams.Readable#pipe()', function() {
  it('throws if the stream isn’t readable', function() {
    var r = Readable.rejected();
    return assert.throws(function() {
      r.pipe(new PassThrough());
    }, Error, 'Stream is not readable.');
  });

  it('works as expected', function() {
    var pt = new PassThrough({ objectMode: true });
    var out = Readable.from(pt).pipe(new PassThrough({ objectMode: true }));

    pt.write(sentinels.one);
    assert.isNull(out.read());
    return new Promise(function(resolve) {
      out.once('readable', resolve);
    }).then(function() {
      assert.strictEqual(out.read(), sentinels.one);
    });
  });
});

describe('streams.Readable#read()', function() {
  it('always returns a Promise', function() {
    var r = Readable.from();
    assert.instanceOf(r.read(), Promise);
  });

  it('returns a rejected promise if the stream is’t readable', function() {
    var r = Readable.from();
    r.cancel();
    return assertErrorMessage(r.read(), 'Stream is not readable.');
  });

  it('rejects the returned promise when the stream has ended during the read',
      function() {
        var pt = new PassThrough();
        var r = Readable.from(pt);
        pt.end();
        return assert.isRejected(r.read(), EndOfStreamError);
      });

  it('rejects the returned promise when the stream errors during the read',
      function() {
        var pt = new PassThrough();
        var r = Readable.from(pt);
        var p = r.read();
        pt.emit('error', sentinels.one);
        return assert.isRejected(p, sentinels.Sentinel);
      });

  it('fulfills with the read value', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);
    var p = r.read();
    pt.write(sentinels.one);
    return assert.eventually.strictEqual(p, sentinels.one);
  });

  it('fulfills with the ended value', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);
    var p = r.read();
    pt.end(sentinels.one);
    return assert.eventually.strictEqual(p, sentinels.one);
  });

  it('cancels the returned promise if the readable itself is cancelled',
      function() {
        var r = Readable.from(new PassThrough());
        var p = r.read();
        r.cancel();
        return assertCancelled(p);
      });

  it('each subsequent call returns a next value', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);

    var first = r.read();
    var second = r.read();
    var third = r.read();

    sentinels.arr().forEach(function(s) {
      pt.write(s);
    });
    pt.end();

    return assert.eventually.deepEqual(
        Promise.join(first, second, third), sentinels.arr());
  });
});

describe('streams.Readable#eachLimited()', function() {
  it('always returns a Promise', function() {
    var r = Readable.from(new PassThrough());
    assert.instanceOf(r.eachLimited(1, identity), Promise);
  });

  it('returns a rejected promise if the stream is’t readable', function() {
    var r = Readable.from();
    r.cancel();
    return assertErrorMessage(r.eachLimited(1, identity),
        'Stream is not readable.');
  });

  it('returns a rejected promise if `maxConcurrent` isn’t a number',
      function() {
        return assert.isRejected(Readable.from().eachLimited(), TypeError);
      });

  it('returns a rejected promise if `iterator` isn’t a function',
      function() {
        return assert.isRejected(Readable.from().eachLimited(1), TypeError);
      });

  it('promises rejection if the iterator throws', function() {
    var pt = new PassThrough({ objectMode: true });
    var r = Readable.from(pt);
    pt.end(sentinels.one);
    var result = r.eachLimited(1, thrower);
    return assert.isRejected(result, sentinels.Sentinel);
  });

  it('promises rejection with the reason of the first rejected promise ' +
      'by the iterator',
      function() {
        var stream = new StreamArray([
          {},
          Promise.rejected(sentinels.one),
          Promise.rejected({})
        ]);
        var result = Readable.from(stream).eachLimited(1, identity);
        return assert.isRejected(result, sentinels.Sentinel);
      });

  it('calls iterator with each chunk, in order', function() {
    var spy = sinon.spy();
    return Readable.from(new StreamArray(sentinels.arr()))
        .eachLimited(1, spy).then(function() {
          assert.calledThrice(spy);
          assert.deepEqual(spy.firstCall.args, [sentinels.one]);
          assert.deepEqual(spy.secondCall.args, [sentinels.two]);
          assert.deepEqual(spy.thirdCall.args, [sentinels.three]);
        });
  });

  it('fulfills when the stream ends', function() {
    return assert.eventually.isUndefined(
        Readable.from(new StreamArray(sentinels.arr()))
            .eachLimited(1, identity));
  });

  it('respects the max concurrency', function() {
    function testIteration(iterationIndex, allSpies) {
      // Only previous iterators should have been called.
      allSpies.forEach(function(spy, spyIndex) {
        if (spyIndex < iterationIndex) {
          assert.called(spy);
        } else if (spyIndex > iterationIndex) {
          assert.notCalled(spy);
        }
      });

      return delay().then(function() {
        // Given concurrency of 2, previous and the *next*
        // iterator should have been called.
        allSpies.forEach(function(spy, spyIndex) {
          if (spyIndex < iterationIndex || spyIndex === iterationIndex + 1) {
            assert.called(spy);
          } else if (spyIndex > iterationIndex) {
            assert.notCalled(spy);
          }
        });
      });
    }

    var spies = [];
    for (var i = 0; i < 10; i++) {
      spies.push(sinon.spy(testIteration));
    }

    var index = 0;
    return Readable.from(new StreamArray(spies.slice()))
        .eachLimited(2, function(spy) {
          return spy(index++, spies);
        });
  });

  it('stops iteration when cancelled', function() {
    var arr = sentinels.arr();
    var spy = sinon.spy(function(item) {
      if (item === sentinels.two) {
        result.cancel();
      }
    });
    var result = Readable.from(new StreamArray(arr)).eachLimited(1, spy);
    return assertCancelled(result).then(function() {
      assert.calledTwice(spy);
    });
  });

  it('propagates cancellation to iterator-returned promises', function() {
    var p1 = new Promise(function() {});
    var p2 = new Promise(function() {});
    var arr = sentinels.arr();
    var result = Readable.from(new StreamArray(arr))
        .eachLimited(3, function(x) {
          if (x === sentinels.one) {
            return x;
          }
          if (x === sentinels.two) {
            return p1;
          }
          if (x === sentinels.three) {
            setImmediate(result.cancel);
            return p2;
          }
        });

    return assertCancelled(result).then(function() {
      return assertCancelled(p1);
    }).then(function() {
      return assertCancelled(p2);
    });
  });

  it('waits for the next chunk if necessary', function() {
    var spy = sinon.spy();
    var pt = new PassThrough({ objectMode: true });
    Readable.from(pt).eachLimited(1, spy);

    pt.write(sentinels.one);
    return delay().then(function() {
      assert.calledOnce(spy);
      assert.deepEqual(spy.firstCall.args, [sentinels.one]);

      pt.write(sentinels.two);
      return delay();
    }).then(function() {
      assert.calledTwice(spy);
      assert.deepEqual(spy.secondCall.args, [sentinels.two]);

      pt.end(sentinels.three);
      return delay();
    }).then(function() {
      assert.calledThrice(spy);
      assert.deepEqual(spy.thirdCall.args, [sentinels.three]);
    });
  });

  it('ends correctly if last iteration returns pending promise', function() {
    var resolvePending;
    var pending = new Promise(function(resolve) { resolvePending = resolve; });

    var pt = new PassThrough({ objectMode: true });
    var result = Readable.from(pt).eachLimited(1, identity);

    pt.end(pending);
    resolvePending();

    return assert.eventually.isUndefined(result);
  });
});

describe('streams.Readable#each()', function() {
  it('uses #eachLimited(Infinity, iterator) under the hood', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var spy = sinon.spy(r, 'eachLimited');
    var result = r.each(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, Infinity, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#eachSeries()', function() {
  it('uses #eachLimited(1, iterator) under the hood', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var spy = sinon.spy(r, 'eachLimited');
    var result = r.eachSeries(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, 1, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#_produceLimited()', function() {
  it('returns a new Readable instance', function() {
    var r = Readable.from(new PassThrough());
    var r2 = r._produceLimited(1, identity, identity);
    assert.instanceOf(r2, Readable);
    assert.notStrictEqual(r2, r);
  });

  it('uses #eachLimited(maxConcurrent, iterator) for iterating', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var spy = sinon.spy(r, 'eachLimited');
    var r2 = r._produceLimited(3, identity, identity);
    return r2.read().then(function() {
      assert.calledOnce(spy);
      assert.calledWithMatch(spy,
          sinon.match(3),
          sinon.match.func);
    });
  });

  it('doesn’t start iterating until returned stream is read', function() {
    var spy = sinon.spy(identity);
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r._produceLimited(1, spy, identity);
    return delay().then(function() {
      assert.notCalled(spy);
      return r2.read();
    }).then(function() {
      assert.calledThrice(spy);
      assert.calledWithExactly(spy, sentinels.one);
      assert.calledWithExactly(spy, sentinels.two);
      assert.calledWithExactly(spy, sentinels.three);
    });
  });

  it('ends returned stream when iteration has finished', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r._produceLimited(1, identity, identity);
    return assert.eventually.isUndefined(r2.each(identity));
  });

  it('forwards iteration error to returned stream', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r._produceLimited(1, thrower, identity);
    return assert.isRejected(r2.each(identity), sentinels.Sentinel);
  });

  it('returned stream can exact backpressure', function() {
    var spy = sinon.spy(identity);
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r._produceLimited(1, spy, identity, {
      objectMode: true,
      highWaterMark: 1
    });

    assert.notCalled(spy);
    return r2.read().then(function() {
      return delay();
    }).then(function() {
      assert.calledTwice(spy);
      return r2.read();
    }).then(function() {
      return delay();
    }).then(function() {
      assert.calledThrice(spy);
    });
  });

  it('produces chunks for the returned stream in the same order', function() {
    var resolvers = [];
    function async(chunk) {
      return new Promise(function(resolve) {
        resolvers.push(function() {
          resolve(chunk);
        });
      });
    }

    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r._produceLimited(3, async, identity);

    var first = r2.read(1);
    var second = r2.read(2);
    var third = r2.read(3);
    return delay().then(function() {
      assert.lengthOf(resolvers, 3);

      resolvers[1]();
      return delay();
    }).then(function() {
      assert.isFalse(first.inspectState().isFulfilled);
      assert.isFalse(second.inspectState().isFulfilled);
      assert.isFalse(third.inspectState().isFulfilled);

      resolvers[0]();
      return delay();
    }).then(function() {
      return assert.eventually.strictEqual(first, sentinels.one);
    }).then(function() {
      return assert.eventually.strictEqual(second, sentinels.two);
    }).then(function() {
      resolvers[2]();
      return assert.eventually.strictEqual(third, sentinels.three);
    });
  });

  it('propagates cancellation to iterator-returned promises', function() {
    var p1 = new Promise(function() {});
    var p2 = new Promise(function() {});
    var result = Readable.from(new StreamArray(sentinels.arr()))
        ._produceLimited(3, function(x) {
          if (x === sentinels.one) {
            return x;
          }
          if (x === sentinels.two) {
            return p1;
          }
          if (x === sentinels.three) {
            setImmediate(result.cancel);
            return p2;
          }
        }, identity);

    return result.read().then(function() {
      return assertCancelled(result).then(function() {
        return assertCancelled(p1);
      }).then(function() {
        return assertCancelled(p2);
      });
    });
  });

  describe('takes a produce() argument', function() {
    it('allows results to be produced by returning truthy values', function() {
      var result = Readable.from(new StreamArray(sentinels.arr()))
          ._produceLimited(1, identity, function(s) {
            return s !== sentinels.two;
          });

      return assert.eventually.deepEqual(
          Promise.join(result.read(), result.read()),
          [sentinels.one, sentinels.three]);
    });

    it('can decide to produce the original chunk instead of the result',
        function() {
          var result = Readable.from(new StreamArray(sentinels.arr()))
              ._produceLimited(1, function() { return null; }, function() {
                return result._PRODUCE_CHUNK_INSTEAD_;
              });

          return assert.eventually.deepEqual(
              Promise.join(result.read(), result.read(), result.read()),
              sentinels.arr());
        });
  });

  describe('takes an optional options argument', function() {
    it('defaults to original underlying stream', function() {
      var r = Readable.from(new PassThrough({
        encoding: 'hex',
        objectMode: true
      }));
      var r2 = r._produceLimited(1, identity, identity);
      var state = r2._getUnderlyingStreamState();
      assert.propertyVal(state, 'encoding', 'hex');
      assert.propertyVal(state, 'objectMode', true);
    });

    it('defines options for native stream underlying the returned Readable',
        function() {
          var r = Readable.from(new PassThrough());
          var r2 = r._produceLimited(1, identity, identity, {
            encoding: 'hex',
            objectMode: true
          });
          var state = r2._getUnderlyingStreamState();
          assert.propertyVal(state, 'encoding', 'hex');
          assert.propertyVal(state, 'objectMode', true);
        });
  });
});

describe('streams.Readable#mapLimited()', function() {
  it('uses #_produceLimited(maxConcurrent, iterator, …, options) under' +
      'the hood',
      function() {
        var r = Readable.from(new PassThrough());
        var spy = sinon.spy(r, '_produceLimited');
        var result = r.mapLimited(3, identity, sentinels.one);
        assert.calledOnce(spy);
        assert.calledWithMatch(spy,
            sinon.match(3),
            sinon.match.same(identity),
            sinon.match.func,
            sinon.match.same(sentinels.one));
        assert.strictEqual(result, spy.returnValues[0]);
      });

  it('produces a mapped result', function() {
    var r = Readable.from(new StreamArray(['foo', 'bar', 'baz']));
    var r2 = r.mapLimited(1, function(s) {
      return s.toUpperCase();
    });
    return assert.eventually.deepEqual(
        Promise.join(r2.read(), r2.read(), r2.read()),
        ['FOO', 'BAR', 'BAZ']);
  });

  it('rejects the resulting readable if the map operation returns a null value',
      function() {
        var r = Readable.from(new StreamArray([sentinels.one]));
        var r2 = r.mapLimited(1, function() {
          return null;
        });
        r2.read();
        return assert.isRejected(r2, TypeError);
      });

  it('rejects the resulting readable if the map operation returns ' +
      'an undefined value',
      function() {
        var r = Readable.from(new StreamArray([sentinels.one]));
        var r2 = r.mapLimited(1, function() {
          return undefined;
        });
        r2.read();
        return assert.isRejected(r2, TypeError);
      });
});

describe('streams.Readable#map()', function() {
  it('uses #mapLimited(Infinity, iterator, options) under the hood',
      function() {
        var r = Readable.from(new PassThrough());
        var spy = sinon.spy(r, 'mapLimited');
        var result = r.map(identity, sentinels.one);
        assert.calledOnce(spy);
        assert.calledWithExactly(spy, Infinity, identity, sentinels.one);
        assert.strictEqual(result, spy.returnValues[0]);
      });
});

describe('streams.Readable#mapSeries()', function() {
  it('uses #mapLimited(1, iterator, options) under the hood', function() {
    var r = Readable.from(new PassThrough());
    var spy = sinon.spy(r, 'mapLimited');
    var result = r.mapSeries(identity, sentinels.one);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, 1, identity, sentinels.one);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#filterLimited()', function() {
  it('uses #_produceLimited(maxConcurrent, iterator, …) under' +
      'the hood',
      function() {
        var r = Readable.from(new PassThrough());
        var spy = sinon.spy(r, '_produceLimited');
        var result = r.filterLimited(3, identity);
        assert.calledOnce(spy);
        assert.calledWithMatch(spy,
            sinon.match(3),
            sinon.match.same(identity),
            sinon.match.func);
        assert.strictEqual(result, spy.returnValues[0]);
      });

  it('produces a filtered result', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r.filterLimited(1, function(s) {
      return s !== sentinels.two;
    });
    return assert.eventually.deepEqual(
        Promise.join(r2.read(), r2.read()),
        [sentinels.one, sentinels.three]);
  });
});

describe('streams.Readable#filter()', function() {
  it('uses #filterLimited(Infinity, iterator) under the hood', function() {
    var r = Readable.from(new PassThrough());
    var spy = sinon.spy(r, 'filterLimited');
    var result = r.filter(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, Infinity, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#filterSeries()', function() {
  it('uses #filterLimited(1, iterator) under the hood', function() {
    var r = Readable.from(new PassThrough());
    var spy = sinon.spy(r, 'filterLimited');
    var result = r.filterSeries(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, 1, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#filterOutLimited()', function() {
  it('uses #_produceLimited(maxConcurrent, iterator, …) under' +
      'the hood',
      function() {
        var r = Readable.from(new PassThrough());
        var spy = sinon.spy(r, '_produceLimited');
        var result = r.filterOutLimited(3, identity);
        assert.calledOnce(spy);
        assert.calledWithMatch(spy,
            sinon.match(3),
            sinon.match.same(identity),
            sinon.match.func);
        assert.strictEqual(result, spy.returnValues[0]);
      });

  it('produces a filtered out result', function() {
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var r2 = r.filterOutLimited(1, function(s) {
      return s === sentinels.two;
    });
    return assert.eventually.deepEqual(
        Promise.join(r2.read(), r2.read()),
        [sentinels.one, sentinels.three]);
  });
});

describe('streams.Readable#filterOut()', function() {
  it('uses #filterOutLimited(Infinity, iterator) under the hood', function() {
    var r = Readable.from(new PassThrough());
    var spy = sinon.spy(r, 'filterOutLimited');
    var result = r.filterOut(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, Infinity, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#filterOutSeries()', function() {
  it('uses #filterOutLimited(1, iterator) under the hood', function() {
    var r = Readable.from(new PassThrough());
    var spy = sinon.spy(r, 'filterOutLimited');
    var result = r.filterOutSeries(identity);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, 1, identity);
    assert.strictEqual(result, spy.returnValues[0]);
  });
});

describe('streams.Readable#foldl()', function() {
  it('always returns a Promise', function() {
    assert.instanceOf(
        Readable.from(new PassThrough()).foldl(null, identity), Promise);
  });

  it('promises the memo value if the stream is empty', function() {
    var pt = new PassThrough();
    pt.end();
    return assert.eventually.strictEqual(
        Readable.from(pt).foldl(sentinels.one, identity),
        sentinels.one);
  });

  describe('accepts a promise for the memo value', function() {
    it('waits until it’s resolved', function() {
      var spy = sinon.spy(identity);
      var memo = Promise.from(sentinels.one);

      var r = Readable.from(new StreamArray([sentinels.two]));
      return r.foldl(memo, spy).then(function() {
        assert.calledOnce(spy);
        assert.calledWithExactly(spy, sentinels.one, sentinels.two);
      });
    });

    it('rejects if the memo rejects', function() {
      var memo = Promise.rejected(sentinels.one);
      return assert.isRejected(
          Readable.from(new PassThrough()).foldl(memo, identity),
          sentinels.Sentinel);
    });

    it('propagates cancellation to the promise', function() {
      var memo = new Promise(function() {});
      var result = Readable.from(new PassThrough()).foldl(memo, identity);
      setImmediate(result.cancel);
      return assert.isRejected(memo, CancellationError);
    });
  });

  it('calls iterator with memo and item, in order',
      function() {
        var spy = sinon.spy(identity);
        var r = Readable.from(new StreamArray(sentinels.arr()));
        return r.foldl(sentinels.one, spy).then(function() {
          assert.calledThrice(spy);
          assert.deepEqual(spy.firstCall.args,
              [sentinels.one, sentinels.one]);
          assert.deepEqual(spy.secondCall.args,
              [sentinels.one, sentinels.two]);
          assert.deepEqual(spy.thirdCall.args,
              [sentinels.one, sentinels.three]);
        });
      });

  it('returns the result of the operation', function() {
    var arr = new StreamArray([0, 2, 2, 3]);
    var result = Readable.from(arr).foldl([1], function(memo, item) {
      return memo.concat(memo[memo.length - 1] + item);
    });
    return assert.eventually.deepEqual(result, [1, 1, 3, 5, 8]);
  });

  describe('rejects if iterator throws', function() {
    function doAsTold(_, told) {
      if (told instanceof Promise) {
        return told;
      }
      if (told === Error) {
        throw sentinels.one;
      }
    }

    it('does so at the first iteration', function() {
      return assert.isRejected(
          Readable.from(new StreamArray([Error])).foldl(null, doAsTold),
          sentinels.Sentinel);
    });

    it('does so at the second iteration', function() {
      return assert.isRejected(
          Readable.from(new StreamArray([false, Error])).foldl(null, doAsTold),
          sentinels.Sentinel);
    });

    it('does so if the first iteration returned a promise', function() {
      var r = Readable.from(new StreamArray([Promise.from(1), Error]));
      return assert.isRejected(r.foldl(null, doAsTold), sentinels.Sentinel);
    });
  });

  it('stops iteration when cancelled', function() {
    var spy = sinon.spy(function(_, item) {
      if (item !== sentinels.two) {
        result.cancel();
      }
    });
    var r = Readable.from(new StreamArray(sentinels.arr()));
    var result = r.foldl(null, spy);
    return assert.isRejected(result, CancellationError).then(function() {
      assert.calledOnce(spy);
    });
  });

  it('propagates cancellation to iterator-returned promises', function() {
    var p = new Promise(function() {});
    var result = Readable.from(new StreamArray([p])).foldl(null, function() {
      setImmediate(result.cancel);
      return p;
    });
    return assert.isRejected(result, CancellationError).then(function() {
      return assert.isRejected(p, CancellationError);
    });
  });
});

function testCheckers(methods, describeMore) {
  function determineMaxConcurrent(method) {
    if (/Series$/.test(method)) {
      return 1;
    } else if (/Limited$/.test(method)) {
      return 2;
    } else {
      return Infinity;
    }
  }

  function makeCallMethod(method, maxConcurrent) {
    return function(collection, iterator) {
      if (/Limited$/.test(method)) {
        return collection[method](maxConcurrent, iterator);
      } else {
        return collection[method](iterator);
      }
    };
  }

  methods.forEach(function(method) {
    var maxConcurrent = determineMaxConcurrent(method);
    var callMethod = makeCallMethod(method, maxConcurrent);

    describe('Readable#' + method + '()', function() {
      it('always returns a Promise', function() {
        assert.instanceOf(
            callMethod(Readable.from(new PassThrough())),
            Promise);
      });

      if (/Limited$/.test(method)) {
        it('uses #eachLimited(maxConcurrent, func) under the hood', function() {
          var r = Readable.from(new StreamArray([42]));
          var spy = sinon.spy(r, 'eachLimited');
          callMethod(r, identity);
          assert.calledOnce(spy);
          assert.lengthOf(spy.firstCall.args, 2);
          assert.equal(spy.firstCall.args[0], maxConcurrent);
          assert.isFunction(spy.firstCall.args[1]);
        });
      } else {
        var limitedMethod = method.replace(/Series$/, '') + 'Limited';
        it('uses #' + limitedMethod + '(' + maxConcurrent + ', iterator) ' +
            'under the hood',
            function() {
              var r = Readable.from(new StreamArray([42]));
              var spy = sinon.spy(r, limitedMethod);
              callMethod(r, identity);
              assert.calledOnce(spy);
              assert.calledWithExactly(spy, maxConcurrent, identity);
            });
      }

      if (describeMore) {
        describeMore(callMethod, method, maxConcurrent);
      }
    });
  });
}

testCheckers(['detect', 'detectSeries', 'detectLimited'],
    function(callMethod, method) {
      it('returns the detected item', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function(item) { return item === sentinels.two; });
        return assert.eventually.strictEqual(result, sentinels.two);
      });

      it('returns undefined if it can’t detect the item', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function() { return false; });
        return assert.eventually.isUndefined(result);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function(item) { return Promise.from(item === sentinels.two); });
        return assert.eventually.strictEqual(result, sentinels.two);
      });

      if (method === 'detectSeries') {
        it('indeed stops iteration once an item is detected', function() {
          var spy = sinon.spy(function(item) {
            return item === sentinels.two;
          });
          var result = callMethod(
              Readable.from(new StreamArray(sentinels.arr())), spy);
          return assert.eventually.strictEqual(result, sentinels.two)
              .then(function() {
                assert.calledTwice(spy);
                assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                assert.deepEqual(spy.secondCall.args, [sentinels.two]);
              });
        });
      }
    });

testCheckers(['some', 'someSeries', 'someLimited'],
    function(callMethod, method) {
      it('returns `true` if an iterator returns a truthy value', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function(item) { return item === sentinels.two; });
        return assert.eventually.strictEqual(result, true);
      });

      it('returns `false` if no iterator returns a truthy value', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function() { return false; });
        return assert.eventually.strictEqual(result, false);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function(item) { return Promise.from(item === sentinels.two); });
        return assert.eventually.strictEqual(result, true);
      });

      if (method === 'someSeries') {
        it('indeed stops iteration once an iterator returns a truthy value',
            function() {
              var spy = sinon.spy(function(item) {
                return item === sentinels.two;
              });
              var result = callMethod(
                  Readable.from(new StreamArray(sentinels.arr())), spy);
              return assert.eventually.strictEqual(result, true)
                  .then(function() {
                    assert.calledTwice(spy);
                    assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                    assert.deepEqual(spy.secondCall.args, [sentinels.two]);
                  });
            });
      }
    });

testCheckers(['every', 'everySeries', 'everyLimited'],
    function(callMethod, method) {
      it('returns `true` if all iterators return a truthy value', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function() { return true; });
        return assert.eventually.strictEqual(result, true);
      });

      it('returns `false` if an iterator returns a falsy value', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function(item) { return item !== sentinels.two; });
        return assert.eventually.strictEqual(result, false);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Readable.from(new StreamArray(sentinels.arr())),
            function() { return Promise.from(true); });
        return assert.eventually.strictEqual(result, true);
      });

      if (method === 'everySeries') {
        it('indeed stops iteration once an iterator returns a falsy value',
            function() {
              var spy = sinon.spy(function(item) {
                return item !== sentinels.two;
              });
              var result = callMethod(
                  Readable.from(new StreamArray(sentinels.arr())), spy);
              return assert.eventually.strictEqual(result, false)
                  .then(function() {
                    assert.calledTwice(spy);
                    assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                    assert.deepEqual(spy.secondCall.args, [sentinels.two]);
                  });
            });
      }
    });

describe('streams.Readable#toCollection()', function() {
  it('promises a Collection for buffering all chunks in the stream',
      function() {
        var r = Readable.from(new StreamArray(sentinels.arr()));
        var c = r.toCollection();
        assert.instanceOf(c, Collection);
        return assert.eventually.deepEqual(c, sentinels.arr());
      });

  it('takes a constructor argument to override the Collection class',
      function() {
        function SubCollection(resolver) {
          if (typeof resolver !== 'function') {
            throw new TypeError();
          }

          if (!(this instanceof SubCollection)) {
            return new SubCollection(resolver);
          }

          if (resolver !== blessed.be) {
            blessed.be(this, resolver, true);
          }
        }
        blessed.extended(SubCollection, Collection);

        var r = Readable.from(new StreamArray(sentinels.arr()));
        var c = r.toCollection(SubCollection);
        assert.instanceOf(c, SubCollection);
      });
});

describe('streams.Readable#toBuffer()', function() {
  it('returns a Promise', function() {
    assert.instanceOf(
        Readable.from(new PassThrough()).toBuffer(),
        Promise);
  });

  it('combines each chunk into a buffer', function() {
    var chunks = [randomBytes(2), randomBytes(2), randomBytes(2)];
    var r = Readable.from(new StreamArray(chunks.slice()));
    return r.toBuffer().then(function(buffer) {
      assert.lengthOf(buffer, 6);
      assert.equal(buffer[0], chunks[0][0]);
      assert.equal(buffer[1], chunks[0][1]);
      assert.equal(buffer[2], chunks[1][0]);
      assert.equal(buffer[3], chunks[1][1]);
      assert.equal(buffer[4], chunks[2][0]);
      assert.equal(buffer[5], chunks[2][1]);
    });
  });

  describe('accepts a length argument', function() {
    it('combines each chunk into a buffer', function() {
      var chunks = [randomBytes(2), randomBytes(2), randomBytes(2)];
      var r = Readable.from(new StreamArray(chunks.slice()));
      return r.toBuffer(6).then(function(buffer) {
        assert.lengthOf(buffer, 6);
        assert.equal(buffer[0], chunks[0][0]);
        assert.equal(buffer[1], chunks[0][1]);
        assert.equal(buffer[2], chunks[1][0]);
        assert.equal(buffer[3], chunks[1][1]);
        assert.equal(buffer[4], chunks[2][0]);
        assert.equal(buffer[5], chunks[2][1]);
      });
    });

    it('fails if there are more chunks than the length allows', function() {
      var chunks = [randomBytes(2), randomBytes(2), randomBytes(2)];
      var r = Readable.from(new StreamArray(chunks.slice()));
      return assert.isRejected(r.toBuffer(4), RangeError);
    });

    it('leaves unknown bytes if there are fewer than the length expects',
        function() {
          var chunks = [randomBytes(2), randomBytes(1)];
          var r = Readable.from(new StreamArray(chunks.slice()));
          return r.toBuffer(4).then(function(buffer) {
            assert.lengthOf(buffer, 4);
            assert.equal(buffer[0], chunks[0][0]);
            assert.equal(buffer[1], chunks[0][1]);
          });
        });
  });
});
