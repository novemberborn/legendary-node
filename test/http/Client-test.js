'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('legendary/test/sentinels');

var Client = require('../../').http.Client;
var util = require('../../lib/http/util');

describe('http.Client(options)', function() {
  it('throws if `options` is falsy', function() {
    assert.throws(function() {
      return new Client(null);
    }, TypeError, 'Expected `options` object.');
  });

  it('throws if `options` is not an object', function() {
    assert.throws(function() {
      return new Client('42');
    }, TypeError, 'Expected `options` object.');
  });

  it('throws if `options.transport` is falsy', function() {
    assert.throws(function() {
      return new Client({ transport: null });
    }, TypeError, 'Expected `transport` option.');
  });

  it('throws if `options.pathname` exists but is not a string', function() {
    assert.throws(function() {
      return new Client({ transport: {}, pathname: null });
    }, TypeError, 'Expected `pathname` to be a non-empty string.');
  });

  it('throws if `options.pathname` exists but is an empty string', function() {
    assert.throws(function() {
      return new Client({ transport: {}, pathname: '' });
    }, TypeError, 'Expected `pathname` to be a non-empty string.');
  });

  it('throws if `options.pathname` contains a `?`', function() {
    assert.throws(function() {
      return new Client({ transport: {}, pathname: '/foo?bar' });
    }, TypeError, '`pathname` cannot contain `?`.');
  });

  it('throws if `options.query` exists but is falsy', function() {
    assert.throws(function() {
      return new Client({ transport: {}, query: null });
    }, TypeError, 'Expected `query` to be an object.');
  });

  it('throws if `options.query` exists but is not an object', function() {
    assert.throws(function() {
      return new Client({ transport: {}, query: '42' });
    }, TypeError, 'Expected `query` to be an object.');
  });

  it('throws if `options.headers` is missing', function() {
    assert.throws(function() {
      return new Client({ transport: {} });
    }, TypeError, 'Expected `headers` option (with `host`).');
  });

  it('throws if `options.headers` is falsy', function() {
    assert.throws(function() {
      return new Client({ transport: {}, headers: null });
    }, TypeError, 'Expected `headers` option (with `host`).');
  });

  it('throws if `options.headers` is not an object', function() {
    assert.throws(function() {
      return new Client({ transport: {}, headers: '42' });
    }, TypeError, 'Expected `headers` option (with `host`).');
  });

  it('sets its `transport` property to `options.transport`', function() {
    var c = new Client({ transport: sentinels.one, headers: { host: 'foo' }});
    assert.strictEqual(c.transport, sentinels.one);
  });

  it('sets its `pathname` property to `options.pathname`', function() {
    var c = new Client({
      transport: sentinels.one,
      headers: { host: 'foo' },
      pathname: '/foo'
    });
    assert.strictEqual(c.pathname, '/foo');
  });

  it('sets its `pathname` property to `/` if `options.pathname` isn’t passed',
      function() {
        var c = new Client({
          transport: sentinels.one,
          headers: { host: 'foo' }
        });
        assert.strictEqual(c.pathname, '/');
      });

  it('sets its `auth` property to `options.auth`', function() {
    var c = new Client({
      transport: sentinels.one,
      headers: { host: 'foo' },
      auth: sentinels.two
    });
    assert.strictEqual(c.auth, sentinels.two);
  });

  it('sets its `auth` property to `null` if `options.auth` isn’t passed',
      function() {
        var c = new Client({
          transport: sentinels.one,
          headers: { host: 'foo' }
        });
        assert.isNull(c.auth);
      });

  it('calls normalizers', function() {
    var mock = sinon.mock({
      _normalizeQuery: function() {},
      _normalizeHeaders: function() {}
    });

    mock.expects('_normalizeQuery').once().withExactArgs(sentinels.one);
    mock.expects('_normalizeHeaders').once().withExactArgs(sentinels.two);

    Client.call(mock.object, {
      transport: {},
      query: sentinels.one,
      headers: sentinels.two
    });

    mock.verify();
  });
});

describe('http.Client#_normalizeQuery(query)', function() {
  var c;
  beforeEach(function() {
    c = new Client({ transport: {}, headers: { host: 'foo' } });
  });

  it('returns an empty array if `query` is falsy', function() {
    assert.deepEqual(c._normalizeQuery(null), []);
  });

  it('throws if `query` contains an empty string as a key', function() {
    assert.throws(function() {
      c._normalizeQuery({ '': true });
    }, TypeError, 'Unexpected empty param name.');
  });

  it('validates values from `query`', function() {
    var stub = sinon.stub(util, 'validQueryValue');

    c._normalizeQuery({ foo: 'bar' });

    stub.restore();
    assert.calledOnce(stub);
    assert.calledWithExactly(stub, 'bar', 'foo');
  });

  it('creates a list of params and values', function() {
    assert.deepEqual(c._normalizeQuery({ foo: 'bar' }), ['foo', 'bar']);
  });
});

describe('http.Client#_normalizeHeaders(headers)', function() {
  var c;
  beforeEach(function() {
    c = new Client({ transport: {}, headers: { host: 'foo' } });
  });

  it('throws if `headers` contains an empty string as a key', function() {
    assert.throws(function() {
      c._normalizeHeaders({ '': true });
    }, TypeError, 'Unexpected empty header name.');
  });

  it('throws if `headers` does not contain a Host header', function() {
    assert.throws(function() {
      c._normalizeHeaders({});
    }, TypeError, 'Expected `host` header`.');
  });

  it('throws if `headers`contains duplicate, case-insensitive, headers',
      function() {
        assert.throws(function() {
          c._normalizeHeaders({ foo: 'bar', FOO: 'baz' });
        }, TypeError, 'Unexpected duplicate `FOO` header.');
      });

  it('validates values from `headers`', function() {
    var stub = sinon.stub(util, 'validHeaderValue');

    c._normalizeHeaders({ host: 'foo' });

    stub.restore();
    assert.calledOnce(stub);
    assert.calledWithExactly(stub, 'foo', 'host');
  });

  it('creates a list of lowercased headers and values', function() {
    assert.deepEqual(
        c._normalizeHeaders({ host: 'foo', BAR: 'qux' }),
        ['host', 'foo', 'bar', 'qux']);
  });
});

describe('http.Client#request(method, options)', function() {
  var c, t;
  beforeEach(function() {
    t = sinon.mock({ handle: function() {} });
    c = new Client({ transport: t.object, headers: { host: 'foo' } });
  });

  it('instantiates a request descriptor', function() {
    var spy = sinon.spy(c, 'RequestDescriptor');
    c.request(sentinels.one, sentinels.two);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, c, sentinels.one, sentinels.two);
  });

  it('defaults `options` to an empty object', function() {
    var spy = sinon.spy(c, 'RequestDescriptor');
    c.request(sentinels.one);
    assert.calledOnce(spy);
    assert.calledWithMatch(spy,
        sinon.match.same(c),
        sinon.match.same(sentinels.one),
        sinon.match.object);
  });

  it('calls and returns transport.handle()', function() {
    c.RequestDescriptor = function() { return sentinels.one; };
    c.Response = sentinels.two;
    t.expects('handle')
        .once()
        .withArgs(sentinels.one, sentinels.two)
        .returns(sentinels.three);
    var result = c.request();
    assert.strictEqual(result, sentinels.three);
    t.verify();
  });
});

['head', 'get', 'delete', 'put', 'post', 'patch'].forEach(function(method) {
  describe('http.Client#' + method + '(options)', function() {
    it('wraps #request()', function() {
      var c = new Client({ transport: {}, headers: { host: 'foo' } });
      var stub = sinon.stub(c, 'request').returns(sentinels.two);

      var result = c[method](sentinels.one);

      assert.calledOnce(stub);
      assert.calledWithExactly(stub, method.toUpperCase(), sentinels.one);
      assert.strictEqual(result, sentinels.two);
    });
  });
});
