'use strict';

var assert = require('chai').assert;
var sentinels = require('legendary/test/sentinels');

var Response = require('../../').http.Response;
var Readable = require('../../').streams.Readable;
var Promise = require('../../').Promise;

var testConstructor = require('legendary/test/util').testConstructor;
var PassThrough = require('stream').PassThrough;

describe('http.Response', function() {
  testConstructor(Response);
});

describe('http.Response#statusCode', function() {
  it('gets a Promise for the `statusCode` property of the response value',
      function() {
        var p = Response.from({ statusCode: sentinels.one }).statusCode;
        assert.instanceOf(p, Promise);
        assert.notInstanceOf(p, Response);
        return assert.eventually.strictEqual(p, sentinels.one);
      });
});

describe('http.Response#headers', function() {
  it('gets a Promise for the `headers` property of the response value',
      function() {
        var p = Response.from({ headers: sentinels.one }).headers;
        assert.instanceOf(p, Promise);
        assert.notInstanceOf(p, Response);
        return assert.eventually.strictEqual(p, sentinels.one);
      });
});

describe('http.Response#stream', function() {
  it('gets a Readable for the response value', function() {
    var s = Response.from(new PassThrough()).stream;
    assert.instanceOf(s, Readable);
    assert.notInstanceOf(s, Response);
  });

  it('gets the same Readable when accessed multiple times', function() {
    var r = Response.from(new PassThrough());
    assert.strictEqual(r.stream, r.stream);
  });

  it('actually streams', function() {
    var pt = new PassThrough({ objectMode: true });
    var s = Response.from(pt).stream;
    pt.write(sentinels.one);
    pt.write(sentinels.two);
    pt.end(sentinels.three);
    return assert.eventually.deepEqual(
        Promise.join(s.read(), s.read(), s.read()),
        sentinels.arr());
  });
});
