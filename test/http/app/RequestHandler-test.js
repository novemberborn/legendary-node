'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = Object.create(require('legendary/test/sentinels'));

var Request = require('../../../').http.app.Request;
var RequestHandler = require('../../../').http.app.RequestHandler;
var Promise = require('../../../').Promise;
var timed = require('../../../').timed;
var Readable = require('../../../').streams.Readable;
var util = require('../../../lib/http/util');

var PassThrough = require('stream').PassThrough;

function next() {}

sentinels.req = new sentinels.Sentinel();
sentinels.req.on = function() {};
sentinels.res = new sentinels.Sentinel();
sentinels.res.on = function() {};
sentinels.request = new sentinels.Sentinel();

function constant(x) {
  return function() {
    return x;
  };
}

var matchPromise = sinon.match(function(x) {
  return Promise.isInstance(x);
});

describe('http.app.RequestHandler(next, Request)', function() {
  it('throws if `next` is not a function', function() {
    assert.throws(function() {
      /*jshint nonew:false*/
      new RequestHandler(sentinels.one);
    }, TypeError, 'Expected `next` to be a function.');
  });

  it('throws if `Request` is passed but is not a function', function() {
    assert.throws(function() {
      /*jshint nonew:false*/
      new RequestHandler(function() {}, sentinels.one);
    }, TypeError, 'Expected `Request` to be a function.');
  });

  it('sets `.next` to `next`', function() {
    var rh = new RequestHandler(next);
    assert.strictEqual(rh.next, next);
  });

  it('sets `.Request` to `Request`', function() {
    function Request() {}
    var rh = new RequestHandler(next, Request);
    assert.strictEqual(rh.Request, Request);
  });

  it('defaults `.Request` if not passed', function() {
    var rh = new RequestHandler(next);
    assert.strictEqual(rh.Request, Request);
  });
});

describe('http.app.RequestHandler#observe(server)', function() {
  it('adds a listener to `request` events on the `server`', function() {
    var mock = sinon.mock({ on: function() {} });
    mock.expects('on').once().withExactArgs('request', sinon.match.func);

    var rh = new RequestHandler(next);
    rh.observe(mock.object);

    mock.verify();
  });

  it('invokes #_handle() whenever the server emits `request`', function() {
    var onrequest;
    var rh = new RequestHandler(next);
    var stub = sinon.stub(rh, '_handle');

    rh.observe({ on: function(_, cb) { onrequest = cb; } });
    onrequest(sentinels.req, sentinels.res);

    assert.calledOnce(stub);
    assert.calledOn(stub, rh);
    assert.calledWithExactly(stub, sentinels.req, sentinels.res);
  });
});

describe('http.app.RequestHandler#setErrorResponse(response)', function() {
  it('asserts the response prior to setting it', function() {
    var rh = new RequestHandler(next);

    var response = new sentinels.Sentinel();
    response.statusCode = 500;

    var mock = sinon.mock(rh);
    mock.expects('_assertResponse').once().withExactArgs(response, true, false);

    rh.setErrorResponse(response);

    mock.verify();
  });

  it('stores the response in #_errorResponses', function() {
    var rh = new RequestHandler(next);
    sinon.stub(rh, '_assertResponse');
    var response = new sentinels.Sentinel();
    response.statusCode = 500;
    rh.setErrorResponse(response);
    assert.deepEqual(rh._errorResponses, { 500: response });
  });
});

describe('http.app.RequestHandler#cancelAll()', function() {
  it('calls `cancel()` on all #_activePromises', function() {
    var rh = new RequestHandler(next);
    var fakePromise = {
      // Mock expected behavior where cancellation synchronously affects
      // the array.
      cancel: function() { rh._activePromises.shift(); }
    };
    var cancelSpy = sinon.spy(fakePromise, 'cancel');

    rh._activePromises.push(fakePromise, fakePromise);
    rh.cancelAll();

    assert.calledTwice(cancelSpy);
  });
});

describe('http.app.RequestHandler#_allowBody(request, response)',
  function() {
    var rh;
    beforeEach(function() {
      rh = new RequestHandler(next);
    });

    it('normally allows body', function() {
      assert.isTrue(rh._allowBody(
        { method: 'GET' },
        { statusCode: 200 }
      ));
    });

    it('does not allow body if request method is `HEAD`', function() {
      assert.isFalse(rh._allowBody(
        { method: 'HEAD' },
        { statusCode: 200 }
      ));
    });

    describe('`statusCode` influences whether a response body is allowed',
      function() {
        [100, 150, 199, 204, 304].forEach(function(code) {
          it('is not allowed when `statusCode` is `' + code + '`',
            function() {
              assert.isFalse(rh._allowBody(
                { method: 'GET' },
                { statusCode: code }
              ));
            });
        });
      });
  });

describe('http.app.RequestHandler#_assertResponse(response, allowBody, ' +
    'chunkOnly)',
    function() {
      var rh;
      beforeEach(function() {
        rh = new RequestHandler(next);
      });

      it('throws if `response` is falsy', function() {
        assert.throws(function() {
          rh._assertResponse(null);
        }, TypeError, 'Expected response to be an object.');
      });

      it('throws if `response` is truthy, but not an object', function() {
        assert.throws(function() {
          rh._assertResponse(42);
        }, TypeError, 'Expected response to be an object.');
      });

      it('throws if `response.statusCode` is not a number', function() {
        assert.throws(function() {
          rh._assertResponse({ statusCode: null });
        }, TypeError, 'Expected `statusCode` to be a number.');
      });

      it('throws if `response.statusCode` is not a finite number', function() {
        assert.throws(function() {
          rh._assertResponse({ statusCode: Infinity });
        }, TypeError, 'Expected `statusCode` to be a number.');
      });

      it('throws if `response.headers` exists but is falsy', function() {
        assert.throws(function() {
          rh._assertResponse({ statusCode: 200, headers: null });
        }, TypeError, 'Expected `headers` to be an object.');
      });

      it('throws if `response.headers` exists, is truthy, but not an object',
          function() {
            assert.throws(function() {
              rh._assertResponse({ statusCode: 200, headers: 42 });
            }, TypeError, 'Expected `headers` to be an object.');
          });

      it('throws if `response.headers` contains an empty string as a key',
          function() {
            assert.throws(function() {
              rh._assertResponse({ statusCode: 200, headers: { '': true } });
            }, TypeError, 'Unexpected empty header name.');
          });

      it('throws if `response.headers`contains duplicate, ' +
          'case-insensitive, headers',
          function() {
            assert.throws(function() {
              rh._assertResponse({
                statusCode: 200,
                headers: { foo: 'bar', FOO: 'baz' }
              });
            }, TypeError, 'Unexpected duplicate `FOO` header.');
          });

      it('validates values from `response.headers`', function() {
        var stub = sinon.stub(util, 'validHeaderValue');

        rh._assertResponse({ statusCode: 200, headers: { foo: 'bar' } });

        stub.restore();
        assert.calledOnce(stub);
        assert.calledWithExactly(stub, 'bar', 'foo');
      });

      describe('`response.stream`', function() {
        it('throws if the value exists but is falsy', function() {
          assert.throws(function() {
            rh._assertResponse({ statusCode: 200, stream: false }, true);
          }, TypeError, 'Expected `stream` to be pipe()able.');
        });

        it('throws if the value does not have a pipe() function',
            function() {
              assert.throws(function() {
                rh._assertResponse({
                  statusCode: 200,
                  stream: { pipe: null }
                }, true);
              }, TypeError, 'Expected `stream` to be pipe()able.');
            });

        it('throws if `response.chunk` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} },
              chunk: true
            }, true);
          }, TypeError, 'Unexpected `chunk` value when `stream` is present.');
        });

        it('throws if `response.html` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} },
              html: ''
            }, true);
          }, TypeError, 'Unexpected `html` value when `stream` is present.');
        });

        it('throws if `response.json` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} },
              json: true
            }, true);
          }, TypeError, 'Unexpected `json` value when `stream` is present.');
        });

        it('throws if `response.form` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} },
              form: true
            }, true);
          }, TypeError, 'Unexpected `form` value when `stream` is present.');
        });

        it('throws if a response body is disallowed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} }
            }, false);
          }, TypeError, 'Response contains `stream` but no body is allowed.');
        });

        it('throws if only `response.chunk` is allowed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              stream: { pipe: function() {} }
            }, true, true);
          }, TypeError,
              'Response contains `stream` but only `chunk` is allowed.');
        });
      });

      describe('`response.chunk`', function() {
        it('throws if the value exists but is not a buffer', function() {
          assert.throws(function() {
            rh._assertResponse({ statusCode: 200, chunk: 'foo' }, true);
          }, TypeError, 'Expected `chunk` to be a buffer.');
        });

        it('throws if `response.html` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              chunk: new Buffer(''),
              html: ''
            }, true);
          }, TypeError, 'Unexpected `html` value when `chunk` is present.');
        });

        it('throws if `response.json` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              chunk: new Buffer(''),
              json: true
            }, true);
          }, TypeError, 'Unexpected `json` value when `chunk` is present.');
        });

        it('throws if `response.form` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              chunk: new Buffer(''),
              form: true
            }, true);
          }, TypeError, 'Unexpected `form` value when `chunk` is present.');
        });
      });

      describe('`response.html`', function() {
        it('throws if the value exists but is not a string or array',
          function() {
            assert.throws(function() {
              rh._assertResponse({ statusCode: 200, html: undefined }, true);
            }, TypeError, 'Expected `html` to be a string or array.');

            assert.doesNotThrow(function() {
              rh._assertResponse({ statusCode: 200, html: '' }, true);
            });

            assert.doesNotThrow(function() {
              rh._assertResponse({ statusCode: 200, html: [] }, true);
            });
          });

        it('throws if `response.json` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              html: '',
              json: true
            }, true);
          }, TypeError, 'Unexpected `json` value when `html` is present.');
        });

        it('throws if `response.form` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              html: '',
              form: true
            }, true);
          }, TypeError, 'Unexpected `form` value when `html` is present.');
        });

        it('throws if only `response.chunk` is allowed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              html: ''
            }, true, true);
          }, TypeError,
              'Response contains `html` but only `chunk` is allowed.');
        });
      });

      describe('`response.json`', function() {
        it('throws if the value exists but is undefined still', function() {
          assert.throws(function() {
            rh._assertResponse({ statusCode: 200, json: undefined }, true);
          }, TypeError, 'Unexpected undefined value for `json`.');
        });

        it('throws if `response.form` is also passed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              json: true,
              form: true
            }, true);
          }, TypeError, 'Unexpected `form` value when `json` is present.');
        });

        it('throws if only `response.chunk` is allowed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              json: true
            }, true, true);
          }, TypeError,
              'Response contains `json` but only `chunk` is allowed.');
        });
      });

      describe('`response.form`', function() {
        it('throws if the value exists but is falsy', function() {
          assert.throws(function() {
            rh._assertResponse({ statusCode: 200, form: false }, true);
          }, TypeError, 'Expected `form` to be an object.');
        });

        it('throws if the value exists but is not an object', function() {
          assert.throws(function() {
            rh._assertResponse({ statusCode: 200, form: '42' }, true);
          }, TypeError, 'Expected `form` to be an object.');
        });

        it('throws if only `response.chunk` is allowed', function() {
          assert.throws(function() {
            rh._assertResponse({
              statusCode: 200,
              form: {}
            }, true, true);
          }, TypeError,
              'Response contains `form` but only `chunk` is allowed.');
        });
      });
    });

describe('http.app.RequestHandler._handle(req, res)', function() {
  var rh;
  beforeEach(function() {
    rh = new RequestHandler(next, function() {});
  });

  it('uses #Request to construct a request object', function() {
    var spy = sinon.spy(rh, 'Request');
    rh._handle(sentinels.req, sentinels.res);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, sentinels.req);
  });

  it('emits `request` with state object', function() {
    sinon.stub(rh, 'Request').returns(sentinels.request);
    var spy = sinon.spy();
    rh.on('request', spy);
    rh._handle(sentinels.req, sentinels.res);
    assert.calledOnce(spy);
    assert.calledWithMatch(spy,
        sinon.match.hasOwn('underlyingReq', sentinels.req)
          .and(sinon.match.hasOwn('underlyingRes', sentinels.res))
          .and(sinon.match.hasOwn('request', sentinels.request))
    );
  });

  it('passes the request to #next()', function() {
    sinon.stub(rh, 'Request').returns(sentinels.request);
    var spy = sinon.spy(rh, 'next');
    rh._handle(sentinels.req, sentinels.res);
    assert.calledOnce(spy);
    assert.calledWithExactly(spy, sentinels.request);
  });

  it('calls #_writeResponse() with promise returned by #next()', function() {
    var p = Promise.from();
    sinon.stub(rh, 'next').returns(p);
    var spy = sinon.spy(rh, '_writeResponse');
    rh._handle(sentinels.req, sentinels.res);
    assert.calledOnce(spy);
    assert.calledWithMatch(spy,
        sinon.match.same(p),
        sinon.match.hasOwn('underlyingReq')
          .and(sinon.match.hasOwn('underlyingRes'))
          .and(sinon.match.hasOwn('request')));
  });

  it('calls #_writeResponse() with promise for value returned by #next()',
      function() {
        sinon.stub(rh, 'next').returns(sentinels.one);
        var spy = sinon.spy(rh, '_writeResponse');
        rh._handle(sentinels.req, sentinels.res);
        assert.calledOnce(spy);
        assert.calledWithMatch(spy,
            matchPromise,
            sinon.match.hasOwn('underlyingReq')
              .and(sinon.match.hasOwn('underlyingRes'))
              .and(sinon.match.hasOwn('request')));
        return assert.eventually.strictEqual(spy.firstCall.args[0],
            sentinels.one);
      });

  it('cancels the promise returned by #_writeResponse() if `res` is closed',
      function() {
        var cancelSpy = sinon.spy();
        var doClose;
        sinon.stub(rh, '_writeResponse').returns(
          new Promise(constant(cancelSpy))
        );
        rh._handle(sentinels.req, { on: function(_, cb) { doClose = cb; } });
        doClose();
        assert.calledOnce(cancelSpy);
      });

  it('calls #_handleError() if the promise returned by #next() rejects',
      function() {
        sinon.stub(rh, 'next').returns(Promise.rejected(sentinels.one));
        var spy = sinon.stub(rh, '_handleError');
        rh._handle(sentinels.req, sentinels.res);
        return timed.delay().then(function() {
          assert.calledOnce(spy);
          assert.calledWith(spy, sentinels.one);
        });
      });

  it('calls #_handleError() if the promise returned by #_writeResponse() ' +
      'rejects',
      function() {
        sinon.stub(rh, '_writeResponse').returns(
            Promise.rejected(sentinels.one));
        var spy = sinon.stub(rh, '_handleError');
        rh._handle(sentinels.req, sentinels.res);
        return timed.delay().then(function() {
          assert.calledOnce(spy);
          assert.calledWith(spy, sentinels.one);
        });
      });

  it('calls #_handleError() if constructing the request object fails',
      function() {
        sinon.stub(rh, 'Request').throws(sentinels.one);
        var spy = sinon.stub(rh, '_handleError');
        rh._handle(sentinels.req, sentinels.res);
        return timed.delay().then(function() {
          assert.calledOnce(spy);
          assert.calledWith(spy, sentinels.one);
        });
      });

  it('calls #_handleError() if #next() throws',
      function() {
        sinon.stub(rh, 'next').throws(sentinels.one);
        var spy = sinon.stub(rh, '_handleError');
        rh._handle(sentinels.req, sentinels.res);
        return timed.delay().then(function() {
          assert.calledOnce(spy);
          assert.calledWith(spy, sentinels.one);
        });
      });

  it('calls #_trackActivity() with a promise', function() {
    var spy = sinon.spy(rh, '_trackActivity');
    rh._handle(sentinels.req, sentinels.res);
    assert.calledOnce(spy);
    assert.calledWithMatch(spy, matchPromise);
  });

  it('cancelling #_trackActivity()’s promise propagates to the promise ' +
      'returned by #next()',
      function() {
        var cancelSpy = sinon.spy();
        sinon.stub(rh, 'next').returns(new Promise(constant(cancelSpy)));
        var activitySpy = sinon.spy(rh, '_trackActivity');
        rh._handle(sentinels.req, sentinels.res);
        activitySpy.firstCall.args[0].cancel();
        assert.calledOnce(cancelSpy);
      });
});

describe('http.app.RequestHandler#_handleError(error, state)', function() {
  var rh, state;
  beforeEach(function() {
    rh = new RequestHandler(next, function() {});
    rh.on('error', function() {});
    state = new sentinels.Sentinel();
    state.underlyingReq = {
      method: 'GET'
    };
    state.underlyingRes = {
      headersSent: true,
      writeHead: function() {},
      end: function() {}
    };
  });

  it('emits `cancelError` for cancellation errors', function() {
    var p = new Promise(function() {});
    p.cancel();
    var spy = sinon.spy();
    rh.on('cancelError', spy);
    return p.otherwise(function(reason) {
      rh._handleError(reason, state);
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, reason, state);
    });
  });

  it('emits `timeoutError` for timeout errors', function() {
    var p = timed.timeout(0, new Promise(function() {}));
    var spy = sinon.spy();
    rh.on('timeoutError', spy);
    return p.otherwise(function(reason) {
      rh._handleError(reason, state);
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, reason, state);
    });
  });

  it('emits `internalError` for other errors', function() {
    var spy = sinon.spy();
    rh.on('internalError', spy);
    return Promise.rejected(sentinels.one).otherwise(function(reason) {
      rh._handleError(reason, state);
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, reason, state);
    });
  });

  describe('with unsent headers', function() {
    beforeEach(function() {
      state.underlyingRes.headersSent = false;
    });

    it('writes a 503 status for cancellation errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(503);
      mock.expects('end').once();

      var p = new Promise(function() {});
      p.cancel();
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('writes a 504 status for timeout errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(504);
      mock.expects('end').once();

      var p = timed.timeout(0, new Promise(function() {}));
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('writes a 500 status for other errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(500);
      mock.expects('end').once();

      return Promise.rejected().otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });
  });

  describe('with sent headers', function() {
    beforeEach(function() {
      state.underlyingRes.headersSent = true;
    });

    it('noop for cancellation errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').never();
      mock.expects('end').never();

      var p = new Promise(function() {});
      p.cancel();
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('noop for timeout errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').never();
      mock.expects('end').never();

      var p = timed.timeout(0, new Promise(function() {}));
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('noop for other errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').never();
      mock.expects('end').never();

      return Promise.rejected().otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });
  });

  describe('with preconfigured error responses', function() {
    var chunk;
    beforeEach(function() {
      state.underlyingRes.headersSent = false;
      chunk = new Buffer('');
      [500, 503, 504].forEach(function(statusCode) {
        rh.setErrorResponse({
          statusCode: statusCode,
          headers: sentinels.one,
          chunk: new Buffer('')
        });
      });
    });

    it('writes a 503 status for cancellation errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(503, sentinels.one);
      mock.expects('end').once().withExactArgs(chunk);

      var p = new Promise(function() {});
      p.cancel();
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('writes a 504 status for timeout errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(504, sentinels.one);
      mock.expects('end').once().withExactArgs(chunk);

      var p = timed.timeout(0, new Promise(function() {}));
      return p.otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('writes a 500 status for other errors', function() {
      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(500, sentinels.one);
      mock.expects('end').once().withExactArgs(chunk);

      return Promise.rejected().otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });

    it('doesn’t write chunk for HEAD requests', function() {
      state.underlyingReq.method = 'HEAD';

      var mock = sinon.mock(state.underlyingRes);
      mock.expects('writeHead').once().withExactArgs(500, sentinels.one);
      mock.expects('end').once().withExactArgs();

      return Promise.rejected().otherwise(function(reason) {
        rh._handleError(reason, state);
        mock.verify();
      });
    });
  });
});

describe('http.app.RequestHandler#_trackActivity(promise)', function() {
  var rh;
  beforeEach(function() {
    rh = new RequestHandler(next, function() {});
  });

  it('adds the promise to #_activePromises', function() {
    var p = Promise.from();
    rh._trackActivity(p);
    assert.includeMembers(rh._activePromises, [p]);
  });

  it('removes the promise from #_activePromises when fulfilled', function() {
    var p = Promise.from();
    rh._trackActivity(p);
    return p.then(function() {
      assert.strictEqual(rh._activePromises.indexOf(p), -1);
    });
  });

  it('removes the promise from #_activePromises when rejected', function() {
    var p = Promise.rejected();
    rh._trackActivity(p);
    return p.then(null, function() {
      assert.strictEqual(rh._activePromises.indexOf(p), -1);
    });
  });
});

describe('http.app.RequestHandler#_writeResponse(promise, state)', function() {
  var rh, state;
  beforeEach(function() {
    rh = new RequestHandler(next, function() {});
    rh.on('error', function() {});
    state = new sentinels.Sentinel();
    state.underlyingReq = {
      method: 'GET'
    };
    state.underlyingRes = {
      _events: {},
      setHeader: function() {},
      writeHead: function() {},
      write: function() {},
      end: function() {},
      on: function() {},
      once: function() {},
      emit: function() {},
      destroy: function() {}
    };
    state.request = {
      method: 'GET'
    };
  });

  it('calls #_allowBody() with request and `promise` value', function() {
    var stub = sinon.stub(rh, '_allowBody');
    rh._writeResponse(Promise.from(sentinels.one), state);
    return timed.delay().then(function() {
      assert.calledOnce(stub);
      assert.calledWithExactly(stub, state.request, sentinels.one);
    });
  });

  it('calls #_assertResponse() with `promise` value', function() {
    var stub = sinon.stub(rh, '_assertResponse');
    rh._writeResponse(Promise.from(sentinels.one), state);
    return timed.delay().then(function() {
      assert.calledOnce(stub);
      assert.calledWithExactly(stub, sentinels.one, false, false);
    });
  });

  it('sets a default content-type header for HTML response bodies', function() {
    var mock = sinon.mock(state.underlyingRes);
    mock.expects('setHeader').once().withExactArgs('content-type',
        rh.DEFAULT_HTML_CONTENT_TYPE);
    rh._writeResponse(Promise.from({
      statusCode: 200,
      html: ''
    }), state);
    return timed.delay().then(function() {
      mock.verify();
    });
  });

  it('sets a default content-type header for JSON response bodies', function() {
    var mock = sinon.mock(state.underlyingRes);
    mock.expects('setHeader').once().withExactArgs('content-type',
        rh.DEFAULT_JSON_CONTENT_TYPE);
    rh._writeResponse(Promise.from({
      statusCode: 200,
      json: {}
    }), state);
    return timed.delay().then(function() {
      mock.verify();
    });
  });

  it('sets a default content-type header for Form response bodies', function() {
    var mock = sinon.mock(state.underlyingRes);
    mock.expects('setHeader').once().withExactArgs('content-type',
        rh.DEFAULT_FORM_CONTENT_TYPE);
    rh._writeResponse(Promise.from({
      statusCode: 200,
      form: {}
    }), state);
    return timed.delay().then(function() {
      mock.verify();
    });
  });

  it('emits `response` event with the response and state objects', function() {
    var spy = sinon.spy();
    rh.on('response', spy);
    var response = { statusCode: 200 };
    rh._writeResponse(Promise.from(response), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, response, state);
    });
  });

  it('emits `responseBodyIgnored` if there is a response body that is not ' +
    'allowed',
    function() {
      var spy = sinon.spy();
      rh.on('responseBodyIgnored', spy);
      var responseWithChunk = { statusCode: 204, chunk: new Buffer('foo') };
      rh._writeResponse(Promise.from(responseWithChunk), state);
      var responseWithHtml = { statusCode: 204, html: 'foo' };
      rh._writeResponse(Promise.from(responseWithHtml), state);
      return timed.delay().then(function() {
        assert.calledTwice(spy);
        assert.calledWithExactly(spy, responseWithChunk, state);
        assert.calledWithExactly(spy, responseWithHtml, state);
      });
    });

  it('writes head with appropriate status code and headers', function() {
    var mock = sinon.mock(state.underlyingRes);
    var response = { statusCode: 200, headers: {} };
    mock.expects('writeHead').once().withExactArgs(200, response.headers);
    rh._writeResponse(Promise.from(response), state);
    return timed.delay().then(function() {
      mock.verify();
    });
  });

  it('pipes a Readable response stream to the underlying response', function() {
    var mock = sinon.mock(Readable.from());
    mock.expects('pipe').once().withArgs(state.underlyingRes);
    rh._writeResponse(
        Promise.from({ statusCode: 200, stream: mock.object }), state);
    return timed.delay().then(function() {
      mock.verify();
      assert.isTrue(state.streaming);
    });
  });

  it('pipes a streamlike response stream to the underlying response',
      function() {
        var mock = sinon.mock(new PassThrough());
        mock.expects('pipe').once().withArgs(state.underlyingRes);
        rh._writeResponse(
            Promise.from({ statusCode: 200, stream: mock.object }), state);
        return timed.delay().then(function() {
          mock.verify();
          assert.isTrue(state.streaming);
        });
      });

  it('ends with a buffer for a single HTML string', function() {
    var spy = sinon.spy(state.underlyingRes, 'end');
    rh._writeResponse(Promise.from({
      statusCode: 200,
      html: 'foo'
    }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithMatch(spy, sinon.match(function(value) {
        return Buffer.isBuffer(value) &&
            value.toString('utf8') === 'foo';
      }));
    });
  });

  it('writes HTML array, then ends', function() {
    var writeSpy = sinon.spy(state.underlyingRes, 'write');
    var endSpy = sinon.spy(state.underlyingRes, 'end');
    rh._writeResponse(Promise.from({
      statusCode: 200,
      html: ['foo', new Buffer('bar')]
    }), state);
    return timed.delay().then(function() {
      assert.calledTwice(writeSpy);
      assert.calledOnce(endSpy);
      assert.callOrder(writeSpy, endSpy);
      assert.calledWithExactly(writeSpy, 'foo', 'utf8');
      assert.calledWithMatch(writeSpy, sinon.match(function(value) {
        return Buffer.isBuffer(value) &&
            value.toString('utf8') === 'bar';
      }));
    });
  });

  it('ends with a chunk body', function() {
    var spy = sinon.spy(state.underlyingRes, 'end');
    var chunk = new Buffer('');
    rh._writeResponse(Promise.from({ statusCode: 200, chunk: chunk }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, chunk);
    });
  });

  it('ends with a buffer for the stringified JSON object', function() {
    var spy = sinon.spy(state.underlyingRes, 'end');
    rh._writeResponse(Promise.from({
      statusCode: 200,
      json: { foo: 'bar' }
    }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithMatch(spy, sinon.match(function(value) {
        return Buffer.isBuffer(value) &&
            value.toString('utf8') === '{"foo":"bar"}';
      }));
    });
  });

  it('ends with a buffer for the stringified Form object', function() {
    var spy = sinon.spy(state.underlyingRes, 'end');
    rh._writeResponse(Promise.from({
      statusCode: 200,
      form: { foo: 'bår' }
    }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithMatch(spy, sinon.match(function(value) {
        return Buffer.isBuffer(value) &&
            value.toString('utf8') === 'foo=b%C3%A5r';
      }));
    });
  });

  it('simply ends if no response body is allowed', function() {
    var spy = sinon.spy(state.underlyingRes, 'end');
    rh._writeResponse(Promise.from({
      statusCode: 204,
      chunk: new Buffer('foo')
    }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy);
    });
  });

  it('emits `responseError` with the error reason and state object if ' +
      'stream errors',
      function() {
        var spy = sinon.spy();
        rh.on('responseError', spy);
        rh._writeResponse(Promise.from({
          statusCode: 200,
          stream: new Readable(function(_, reject) {
            setImmediate(reject, sentinels.one);
          })
        }), state);
        return timed.delay().then(function() {
          assert.calledOnce(spy);
          assert.calledWithExactly(spy, sentinels.one, state);
        });
      });

  it('rejects write promise if stream errors', function() {
    return assert.isRejected(rh._writeResponse(Promise.from({
      statusCode: 200,
      stream: new Readable(function(_, reject) {
        setImmediate(reject, sentinels.one);
      })
    }), state), sentinels.Sentinel);
  });

  it('destroys underlying response if stream errors', function() {
    var spy = sinon.spy(state.underlyingRes, 'destroy');
    rh._writeResponse(Promise.from({
      statusCode: 200,
      stream: new Readable(function(_, reject) {
        setImmediate(reject, sentinels.one);
      })
    }), state);
    return timed.delay().then(function() {
      assert.calledOnce(spy);
    });
  });

  it('emits `responseFinished` when underlying response finishes', function() {
    var spy = sinon.spy();
    var emitFinish;
    state.underlyingRes.on = function(evt, callback) {
      if (evt === 'finish') {
        emitFinish = callback;
      }
    };
    rh.on('responseFinished', spy);
    rh._writeResponse(Promise.from({ statusCode: 204 }), state);
    return timed.delay().then(function() {
      assert.notCalled(spy);
      emitFinish();
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, state);
    });
  });

  it('resolves after underlying response finishes', function() {
    var emitFinish;
    state.underlyingRes.on = function(evt, callback) {
      if (evt === 'finish') {
        emitFinish = callback;
      }
    };
    var p = rh._writeResponse(Promise.from({ statusCode: 204 }), state);
    return timed.delay().then(function() {
      assert.deepEqual(p.inspectState(), {
        isFulfilled: false,
        isRejected: false
      });
      emitFinish();
      return assert.eventually.isUndefined(p);
    });
  });
});
