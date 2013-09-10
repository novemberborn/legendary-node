'use strict';

var assert = require('chai').assert;
var sentinels = require('legendary/test/sentinels');

var Request = require('../../../').http.app.Request;
var Promise = require('../../../').Promise;
var Readable = require('../../../').streams.Readable;

var PassThrough = require('stream').PassThrough;

describe('http.app.Request()', function() {
  it('assimilates an underlying request stream', function() {
    var req = new PassThrough();
    req.method = sentinels.one;
    var headers = new sentinels.Sentinel();
    headers.host = sentinels.two;
    req.headers = headers;
    req.url = '/foo?bar=qux&%C3%A5=1';

    var r = new Request(req);

    assert.strictEqual(r.underlyingReq, req);
    assert.strictEqual(r.method, sentinels.one);
    assert.strictEqual(r.headers, headers);
    assert.strictEqual(r.host, sentinels.two);
    assert.equal(r.path, '/foo?bar=qux&%C3%A5=1');
    assert.equal(r.pathname, '/foo');
    assert.equal(r.querystring, 'bar=qux&%C3%A5=1');
  });
});

describe('http.app.Request#query', function() {
  var r;
  beforeEach(function() {
    var req = new PassThrough();
    req.headers = {};
    req.url = '/foo?bar=qux&%C3%A5=1';
    r = new Request(req);
  });

  it('provides a parsed query string object', function() {
    var query = r.query;
    assert.isObject(query);
    assert.deepEqual(query, {
      bar: 'qux',
      'å': '1'
    });
  });

  it('always provides the same object', function() {
    assert.strictEqual(r.query, r.query);
  });

  it('can be assigned before reading', function() {
    r.query = sentinels.one;
    assert.strictEqual(r.query, sentinels.one);
  });

  it('can be assigned after reading', function() {
    /*jshint unused:false*/
    var query = r.query;
    r.query = sentinels.one;
    assert.strictEqual(r.query, sentinels.one);
  });
});

describe('http.app.Request#stream', function() {
  var r;
  beforeEach(function() {
    var req = new PassThrough({ objectMode: 1 });
    req.headers = {};
    req.url = '/foo?bar=qux&%C3%A5=1';
    r = new Request(req);
  });

  it('provides a Readable stream unless the HTTP method indicates there ' +
      'won’t be a stream',
      function() {
        assert.instanceOf(r.stream, Readable);
      });

  ['GET', 'DELETE', 'HEAD'].forEach(function(method) {
    it('is `null` for ' + method + ' methods', function() {
      var req = new PassThrough();
      req.method = method;
      req.headers = {};
      req.url = '';
      assert.isNull(new Request(req).stream);
    });
  });

  it('indeed streams data from the underlying request', function() {
    r.underlyingReq.write(sentinels.one);
    r.underlyingReq.write(sentinels.two);
    r.underlyingReq.end(sentinels.three);
    var s = r.stream;
    return assert.eventually.deepEqual(
        Promise.join(s.read(), s.read(), s.read()),
        sentinels.arr());
  });

  it('always provides the same instance', function() {
    assert.strictEqual(r.stream, r.stream);
  });

  it('can be assigned before reading', function() {
    r.stream = sentinels.one;
    assert.strictEqual(r.stream, sentinels.one);
  });

  it('can be assigned after reading', function() {
    /*jshint unused:false*/
    var stream = r.stream;
    r.stream = sentinels.one;
    assert.strictEqual(r.stream, sentinels.one);
  });
});
