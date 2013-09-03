'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('./sentinels');

var RequestDescriptor = require('../../../').http.transports.RequestDescriptor;
var util = require('../../../lib/http/util');

describe('http.transports.RequestDescriptor(client, method, options)',
    function() {
      it('sets its `method` property to `method`', function() {
        var rd = new RequestDescriptor({
          pathname: '/',
          headers: [],
          query: []
        }, sentinels.method, {});
        assert.strictEqual(rd.method, sentinels.method);
      });

      it('calls builders, in order', function() {
        var mock = sinon.mock({
          buildPath: function() {},
          buildHeaders: function() {},
          buildBody: function() {},
          buildAuth: function() {}
        });

        var path = mock.expects('buildPath')
            .once()
            .withExactArgs(sentinels.pathname, sentinels.query, sentinels.one);
        var headers = mock.expects('buildHeaders')
            .once()
            .withExactArgs(sentinels.headers, sentinels.one);
        var body = mock.expects('buildBody')
            .once()
            .withExactArgs(sentinels.one);
        var auth = mock.expects('buildAuth')
            .once()
            .withExactArgs(sentinels.auth);

        RequestDescriptor.call(mock.object, {
          pathname: sentinels.pathname,
          query: sentinels.query,
          headers: sentinels.headers,
          auth: sentinels.auth
        }, sentinels.method, sentinels.one);

        assert.callOrder(path, headers, body, auth);
        mock.verify();
      });
    });

describe('http.transports.RequestDescriptor#buildPath(defaultPathname, ' +
    'baseQuery, options)',
    function() {
      var rd;
      beforeEach(function() {
        rd = new RequestDescriptor({
          pathname: '/',
          headers: [],
          query: []
        }, sentinels.method, {});
      });

      it('throws if `options.pathname` exists but is not a string', function() {
        assert.throws(function() {
          rd.buildPath('/', null, { pathname: null });
        }, TypeError, 'Expected `pathname` to be a non-empty string.');
      });

      it('throws if `options.pathname` is an empty string', function() {
        assert.throws(function() {
          rd.buildPath('/', null, { pathname: '' });
        }, TypeError, 'Expected `pathname` to be a non-empty string.');
      });

      it('throws if the calculated pathname contains a `?`', function() {
        assert.throws(function() {
          rd.buildPath('/', null, { pathname: '/foo?bar' });
        }, TypeError, '`pathname` cannot contain `?`.');
      });

      it('throws if `options.query` exists but is falsy', function() {
        assert.throws(function() {
          rd.buildPath('/', null, { query: null });
        }, TypeError, 'Expected `query` to be an object.');
      });

      it('throws if `options.query` exists, is truthy, but not an object',
          function() {
            assert.throws(function() {
              rd.buildPath('/', null, { query: 42 });
            }, TypeError, 'Expected `query` to be an object.');
          });

      it('relies on #buildQueryPairs()', function() {
        var spy = sinon.spy(rd, 'buildQueryPairs');
        rd.buildPath('/', sentinels.query, { query: sentinels.one });
        assert.calledOnce(spy);
        assert.calledWithExactly(spy, sentinels.query, sentinels.one);
      });

      it('uses the default pathname if none provided in the options',
          function() {
            assert.equal(rd.buildPath('/foo', [], {}), '/foo');
          });

      it('uses the pathname provided in the options', function() {
        assert.equal(rd.buildPath('/foo', [], { pathname: '/bar' }), '/bar');
      });

      it('combines the pathname with the query parts', function() {
        sinon.stub(rd, 'buildQueryPairs', function() {
          return ['bar', 'baz'];
        });
        assert.equal(rd.buildPath('/foo', [], {}), '/foo?bar&baz');
      });
    });

describe('http.transports.RequestDescriptor#buildQueryPairs(base, query)',
    function() {
      var rd;
      beforeEach(function() {
        rd = new RequestDescriptor({
          pathname: '/',
          headers: [],
          query: []
        }, sentinels.method, {});
      });

      it('creates encoded pairs from the `base` list', function() {
        assert.deepEqual(
            rd.buildQueryPairs(['foo', 'bar', 'bäz', 'qüx']),
            ['foo=bar', 'b%C3%A4z=q%C3%BCx']);
      });

      it('throws if `query` contains an empty string as a key', function() {
        assert.throws(function() {
          rd.buildQueryPairs([], { '': true });
        }, TypeError, 'Unexpected empty param name.');
      });

      it('validates values from `query`', function() {
        var stub = sinon.stub(util, 'validQueryValue');

        rd.buildQueryPairs([], { foo: 'bar' });

        stub.restore();
        assert.calledOnce(stub);
        assert.calledWithExactly(stub, 'bar', 'foo');
      });

      it('creates encoded pairs from the `query` object', function() {
        assert.deepEqual(
            rd.buildQueryPairs([], { 'foo': 'bar', 'bäz': 'qüx' }),
            ['foo=bar', 'b%C3%A4z=q%C3%BCx']);
      });

      it('combines `base` and `query`, with the latter taking precedence',
          function() {
            var pairs = rd.buildQueryPairs(
                ['foo', '---', 'baz', 'qux'],
                { 'foo': 'bar', 'quux': 'corge' });
            assert.deepEqual(pairs, ['baz=qux', 'foo=bar', 'quux=corge']);
          });
    });

describe('http.transports.RequestDescriptor#buildHeaders(base, options)',
    function() {
      var rd;
      beforeEach(function() {
        rd = new RequestDescriptor({
          pathname: '/',
          headers: [],
          query: []
        }, sentinels.method, {});
      });

      it('constructs an object from the `base` list', function() {
        assert.deepEqual(
            rd.buildHeaders(['foo', 'bar', 'baz', 'qux'], {}),
            { foo: 'bar', baz: 'qux' });
      });

      it('throws if `options.headers` exists but is falsy', function() {
        assert.throws(function() {
          rd.buildHeaders([], { headers: null });
        }, TypeError, 'Expected `headers` to be an object.');
      });

      it('throws if `options.headers` exists, is truthy, but not an object',
          function() {
            assert.throws(function() {
              rd.buildHeaders([], { headers: 42 });
            }, TypeError, 'Expected `headers` to be an object.');
          });

      it('throws if `options.headers` contains an empty string as a key',
          function() {
            assert.throws(function() {
              rd.buildHeaders([], { headers: { '': true } });
            }, TypeError, 'Unexpected empty header name.');
          });

      it('throws if `options.headers` tries to override the Host header',
          function() {
            assert.throws(function() {
              rd.buildHeaders([], { headers: { 'host': true } });
            }, TypeError, 'Can’t override `host` header.');
          });

      it('throws if `options.headers`contains duplicate, ' +
          'case-insensitive, headers',
          function() {
            assert.throws(function() {
              rd.buildHeaders([], { headers: { foo: 'bar', FOO: 'baz' } });
            }, TypeError, 'Unexpected duplicate `FOO` header.');
          });

      it('validates values from `options.headers`', function() {
        var stub = sinon.stub(util, 'validHeaderValue');

        rd.buildHeaders([], { headers: { foo: 'bar' } });

        stub.restore();
        assert.calledOnce(stub);
        assert.calledWithExactly(stub, 'bar', 'foo');
      });

      it('uses lowercased header names from `options.headers`', function() {
        assert.deepEqual(rd.buildHeaders([], { headers: { FoO: 'bar' } }),
            { foo: 'bar' });
      });

      it('combines `base` and `options.headers`, with the latter taking ' +
          'precedence',
          function() {
            var headers = rd.buildHeaders(
                ['foo', '---', 'baz', 'qux'],
                { headers: { 'foo': 'bar', 'quux': 'corge' } });
            assert.deepEqual(headers,
                { baz: 'qux', foo: 'bar', quux: 'corge' });
          });
    });

describe('http.transports.RequestDescriptor#buildBody(options)', function() {
  var rd;
  beforeEach(function() {
    rd = new RequestDescriptor({
      pathname: '/',
      headers: [],
      query: []
    }, sentinels.method, {});
  });

  describe('`options.stream`', function() {
    it('throws if the option exists but is falsy', function() {
      assert.throws(function() {
        rd.buildBody({ stream: false });
      }, TypeError, 'Expected `stream` to be pipe()able.');
    });

    it('throws if the option does not have a pipe() function',
        function() {
          assert.throws(function() {
            rd.buildBody({ stream: { pipe: null } });
          }, TypeError, 'Expected `stream` to be pipe()able.');
        });

    it('throws if `options.chunk` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ stream: { pipe: function() {} }, chunk: true });
      }, TypeError, 'Unexpected `chunk` option when `stream` is present.');
    });

    it('throws if `options.json` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ stream: { pipe: function() {} }, json: true });
      }, TypeError, 'Unexpected `json` option when `stream` is present.');
    });

    it('throws if `options.form` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ stream: { pipe: function() {} }, form: true });
      }, TypeError, 'Unexpected `form` option when `stream` is present.');
    });

    it('returns a wrapped stream', function() {
      var stream = { pipe: function() {} };
      assert.deepEqual(rd.buildBody({ stream: stream }), { stream: stream });
    });
  });

  describe('`options.chunk`', function() {
    it('throws if the option exists but is not a buffer', function() {
      assert.throws(function() {
        rd.buildBody({ chunk: 'foo' });
      }, TypeError, 'Expected `chunk` to be a buffer.');
    });

    it('throws if `options.json` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ chunk: new Buffer(''), json: true });
      }, TypeError, 'Unexpected `json` option when `chunk` is present.');
    });

    it('throws if `options.form` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ chunk: new Buffer(''), form: true });
      }, TypeError, 'Unexpected `form` option when `chunk` is present.');
    });

    it('returns a wrapped chunk', function() {
      var chunk = new Buffer('');
      assert.deepEqual(rd.buildBody({ chunk: chunk }), { chunk: chunk });
    });
  });

  describe('`options.json`', function() {
    it('throws if the option exists but is undefined still', function() {
      assert.throws(function() {
        rd.buildBody({ json: undefined });
      }, TypeError, 'Unexpected undefined value for `json`.');
    });

    it('throws if `options.form` is also passed', function() {
      assert.throws(function() {
        rd.buildBody({ json: true, form: true });
      }, TypeError, 'Unexpected `form` option when `json` is present.');
    });

    it('sets the default JSON content type', function() {
      rd.DEFAULT_JSON_CONTENT_TYPE = sentinels.one;
      rd.buildBody({ json: true });
      assert.strictEqual(rd.headers['content-type'], sentinels.one);
    });

    it('doesn’t override an existing content type', function() {
      rd.DEFAULT_JSON_CONTENT_TYPE = sentinels.one;
      rd.headers['content-type'] = sentinels.two;
      rd.buildBody({ json: true });
      assert.strictEqual(rd.headers['content-type'], sentinels.two);
    });

    it('returns a wrapped chunk of stringified JSON', function() {
      var wrapped = rd.buildBody({ json: true });
      assert.property(wrapped, 'chunk');
      assert.instanceOf(wrapped.chunk, Buffer);
      assert.equal(wrapped.chunk.toString('utf8'), 'true');
    });
  });

  describe('`options.form`', function() {
    it('throws if the option exists but is falsy', function() {
      assert.throws(function() {
        rd.buildBody({ form: false });
      }, TypeError, 'Expected `form` to be an object.');
    });

    it('throws if the option exists but is not an object', function() {
      assert.throws(function() {
        rd.buildBody({ form: '42' });
      }, TypeError, 'Expected `form` to be an object.');
    });

    it('sets the default Form content type', function() {
      rd.DEFAULT_FORM_CONTENT_TYPE = sentinels.one;
      rd.buildBody({ form: {} });
      assert.strictEqual(rd.headers['content-type'], sentinels.one);
    });

    it('doesn’t override an existing content type', function() {
      rd.DEFAULT_FORM_CONTENT_TYPE = sentinels.one;
      rd.headers['content-type'] = sentinels.two;
      rd.buildBody({ form: {} });
      assert.strictEqual(rd.headers['content-type'], sentinels.two);
    });

    it('encodes the form using #buildQueryPairs()', function() {
      var spy = sinon.spy(rd, 'buildQueryPairs');
      rd.buildBody({ form: sentinels.one });
      assert.calledOnce(spy);
      assert.calledWithMatch(spy,
          sinon.match.array, sinon.match.same(sentinels.one));
    });

    it('returns a wrapped chunk of the encoded form', function() {
      var wrapped = rd.buildBody({ form: { foo: 'bar', baz: 'qux' } });
      assert.property(wrapped, 'chunk');
      assert.instanceOf(wrapped.chunk, Buffer);
      assert.equal(wrapped.chunk.toString('utf8'), 'foo=bar&baz=qux');
    });
  });
});

describe('http.transports.RequestDescriptor#buildAuth(auth)', function() {
  it('returns `auth` as-is', function() {
    var rd = new RequestDescriptor({
      pathname: '/',
      headers: [],
      query: []
    }, sentinels.method, {});
    assert.strictEqual(rd.buildAuth(sentinels.auth), sentinels.auth);
  });
});
