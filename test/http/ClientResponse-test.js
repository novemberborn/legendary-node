'use strict';

var assert = require('chai').assert;
var sentinels = require('legendary/test/sentinels');

var ClientResponse = require('../../').http.ClientResponse;
var Readable = require('../../').streams.Readable;
var Promise = require('../../').Promise;

var testConstructor = require('legendary/test/util').testConstructor;
var PassThrough = require('stream').PassThrough;

describe('http.ClientResponse', function() {
  testConstructor(ClientResponse);
});

describe('http.ClientResponse#statusCode', function() {
  it('gets a Promise for the `statusCode` property of the response value',
      function() {
        var p = ClientResponse.from({ statusCode: sentinels.one }).statusCode;
        assert.instanceOf(p, Promise);
        assert.notInstanceOf(p, ClientResponse);
        return assert.eventually.strictEqual(p, sentinels.one);
      });
});

describe('http.ClientResponse#headers', function() {
  it('gets a Promise for the `headers` property of the response value',
      function() {
        var p = ClientResponse.from({ headers: sentinels.one }).headers;
        assert.instanceOf(p, Promise);
        assert.notInstanceOf(p, ClientResponse);
        return assert.eventually.strictEqual(p, sentinels.one);
      });
});

describe('http.ClientResponse#stream', function() {
  it('gets a Readable for the response value', function() {
    var s = ClientResponse.from(new PassThrough()).stream;
    assert.instanceOf(s, Readable);
    assert.notInstanceOf(s, ClientResponse);
  });

  it('gets the same Readable when accessed multiple times', function() {
    var r = ClientResponse.from(new PassThrough());
    assert.strictEqual(r.stream, r.stream);
  });

  it('actually streams', function() {
    var pt = new PassThrough({ objectMode: true });
    var s = ClientResponse.from(pt).stream;
    pt.write(sentinels.one);
    pt.write(sentinels.two);
    pt.end(sentinels.three);
    return assert.eventually.deepEqual(
        Promise.join(s.read(), s.read(), s.read()),
        sentinels.arr());
  });
});

describe('http.ClientResponse#forApp()', function() {
  it('returns a Promise for an http.app-compatible value object', function() {
    var r = new PassThrough();
    r.statusCode = sentinels.one;
    r.headers = sentinels.two;
    var p = ClientResponse.from(r).forApp();
    assert.instanceOf(p, Promise);
    assert.notInstanceOf(p, ClientResponse);
    return p.then(function(response) {
      assert.strictEqual(response.statusCode, sentinels.one);
      assert.strictEqual(response.headers, sentinels.two);
      assert.instanceOf(response.stream, Readable);
    });
  });
});
