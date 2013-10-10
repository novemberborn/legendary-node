'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('legendary/test/sentinels');

var Promise = require('../../').Promise;
var delay = require('../../').timed.delay;
var EventualStream = require('../../lib/streams/EventualStream');

var PassThrough = require('stream').PassThrough;

describe('streams.EventualStream', function() {
  it('emits `error` if promise rejects', function() {
    var stream = new EventualStream(Promise.rejected(sentinels.one));

    var spy = sinon.spy();
    stream.on('error', spy);

    return delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, sentinels.one);
    });
  });

  it('emits `error` if promise resolves with non-stream value', function() {
    var stream = new EventualStream(Promise.from(sentinels.one));

    var spy = sinon.spy();
    stream.on('error', spy);

    return delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithMatch(spy, sinon.match.instanceOf(TypeError));
    });
  });

  it('forwards `error` when underlying stream errors', function() {
    var pt = new PassThrough();
    var stream = new EventualStream(Promise.from(pt));

    var spy = sinon.spy();
    stream.on('error', spy);

    return Promise.from().then(function() {
      pt.emit('error', sentinels.one);
      return delay();
    }).then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, sentinels.one);
    });
  });

  it('forwards `close` when underlying stream is closed', function() {
    var pt = new PassThrough();
    var stream = new EventualStream(Promise.from(pt));

    var spy = sinon.spy();
    stream.on('close', spy);

    return Promise.from().then(function() {
      pt.emit('close');
      return delay();
    }).then(function() {
      assert.calledOnce(spy);
    });
  });

  it('emits `end` when stream ends', function() {
    var pt = new PassThrough({ objectMode: true, highWaterMark: 1 });
    var stream = new EventualStream(Promise.from(pt));

    var spy = sinon.spy();
    stream.on('end', spy);

    return Promise.from().then(function() {
      pt.end();
      stream.read();
      return delay();
    }).then(function() {
      assert.calledOnce(spy);
    });
  });

  it('lazily reads until stream ends', function() {
    var pt = new PassThrough({ objectMode: true });
    var stream = new EventualStream(Promise.from(pt));

    var readableSpy = sinon.spy();
    stream.on('readable', readableSpy);
    var endSpy = sinon.spy();
    stream.on('end', endSpy);

    return delay().then(function() {
      assert.isNull(stream.read());

      pt.write(sentinels.one);
      assert.calledOnce(readableSpy);
      assert.strictEqual(stream.read(), sentinels.one);

      pt.write(sentinels.two);
      assert.strictEqual(stream.read(), sentinels.two);

      pt.end(sentinels.three);
      assert.strictEqual(stream.read(), sentinels.three);

      assert.isNull(stream.read());

      return delay();
    }).then(function() {
      assert.calledOnce(endSpy);
    });
  });

  describe('correctly sets encoding', function() {
    it('does so when set before promise has fulfilled', function() {
      var pt = new PassThrough();
      var stream = new EventualStream(Promise.from(pt));

      stream.setEncoding('hex');

      return Promise.from().then(function() {
        pt.end(new Buffer('foo', 'utf8'));
        assert.strictEqual(stream.read(), '666f6f');
      });
    });

    it('does so when set after promise has fulfilled', function() {
      var pt = new PassThrough();
      var stream = new EventualStream(Promise.from(pt));

      return Promise.from().then(function() {
        stream.setEncoding('hex');
        pt.end(new Buffer('foo', 'utf8'));
        assert.strictEqual(stream.read(), '666f6f');
      });
    });
  });
});
