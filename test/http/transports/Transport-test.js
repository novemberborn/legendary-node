'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('legendary/test/sentinels');
var optionSentinels = require('./sentinels');

var Transport = require('../../../').http.transports.Transport;
var Promise = require('../../../').Promise;

var EventEmitter = require('events').EventEmitter;

describe('http.transports.Transport(options)', function() {
  it('throws without options', function() {
    assert.throws(function() { return new Transport(); },
        TypeError, 'Expected `options` object.');
  });

  it('takes `hostname`, `port` and `agent` from `options`', function() {
    var t = new Transport({
      hostname: optionSentinels.hostname,
      port: optionSentinels.port,
      agent: optionSentinels.agent
    });

    assert.propertyVal(t, 'hostname', optionSentinels.hostname);
    assert.propertyVal(t, 'port', optionSentinels.port);
    assert.propertyVal(t, 'agent', optionSentinels.agent);
  });

  it('provides defaults for `hostname` and `port`', function() {
    var t = new Transport({});
    assert.propertyVal(t, 'hostname', 'localhost');
    assert.propertyVal(t, 'port', 80);
    assert.isUndefined(t.agent);
  });
});

describe('http.transports.Transport#handle(descriptor, Response)', function() {
  var t;
  beforeEach(function() {
    t = new Transport({
      hostname: optionSentinels.hostname,
      port: optionSentinels.port,
      agent: optionSentinels.agent
    });
  });

  it('makes a request', function() {
    var stub = sinon.stub(t, '_makeRequest');

    t.handle({
      method: optionSentinels.method,
      path: optionSentinels.path,
      headers: optionSentinels.headers,
      auth: optionSentinels.auth
    });

    assert.calledOnce(stub);
    assert.calledWithMatch(stub, sinon.match({
      hostname: optionSentinels.hostname,
      port: optionSentinels.port,
      agent: optionSentinels.agent,
      method: optionSentinels.method,
      path: optionSentinels.path,
      headers: optionSentinels.headers,
      auth: optionSentinels.auth
    }));
  });

  it('uses the `Response` class to make the promise', function() {
    var spy = sinon.spy();
    sinon.stub(t, '_makeRequest');

    t.handle({}, spy);

    assert.calledOnce(spy);
    assert.calledWithMatch(spy, sinon.match.func);
  });

  it('defaults `Response` to the Promise class', function() {
    sinon.stub(t, '_makeRequest');
    var p = t.handle({});
    assert.instanceOf(p, Promise);
  });

  describe('request lifecycle', function() {
    var opts;
    beforeEach(function() {
      opts = {
        method: optionSentinels.method,
        path: optionSentinels.path,
        headers: optionSentinels.headers,
        auth: optionSentinels.auth
      };
    });

    var m;
    beforeEach(function() {
      var ee = new EventEmitter();
      ee.end = function() {};
      ee.abort = function() {};
      m = sinon.mock(ee);
      sinon.stub(t, '_makeRequest', function() { return m.object; });
    });

    it('listens for `response` and `error` events', function() {
      m.expects('on').once().withArgs('response', sinon.match.func);
      m.expects('on').once().withArgs('error', sinon.match.func);

      t.handle(opts);
      m.verify();
    });

    it('removes `response` and `error` event listeners when cancelled',
        function() {
          m.expects('removeListener').once().withArgs('response',
              sinon.match.func);
          m.expects('removeListener').once().withArgs('error',
              sinon.match.func);

          t.handle(opts).cancel();
          m.verify();
        });

    it('aborts when cancelled', function() {
      m.expects('abort').once();

      t.handle(opts).cancel();
      m.verify();
    });

    it('ends without a `body` option', function() {
      m.expects('end').once();

      t.handle(opts);
      m.verify();
    });

    it('pipes the body stream', function() {
      var s = sinon.mock({ pipe: function() {} });
      s.expects('pipe').once().withExactArgs(m.object);

      opts.body = { stream: s.object };
      t.handle(opts);
      m.verify();
    });

    it('ends with the body chunk', function() {
      m.expects('end').once().withExactArgs(sentinels.one);

      opts.body = { chunk: sentinels.one };
      t.handle(opts);
      m.verify();
    });

    it('resolves the promise when `response` is emitted', function() {
      var p = t.handle(opts);
      m.object.emit('response', sentinels.one);
      return assert.eventually.strictEqual(p, sentinels.one);
    });

    it('rejects the promise when `error` is emitted', function() {
      var p = t.handle(opts);
      m.object.emit('error', sentinels.one);
      return assert.isRejected(p, sentinels.Sentinel);
    });
  });
});
