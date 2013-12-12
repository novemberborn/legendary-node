'use strict';

var Promise = require('../../../').Promise;
var Readable = require('../../../').streams.Readable;
var DefaultRequest = require('./Request');
var util = require('../util');

var nativeUtil = require('util');
var events = require('events');
var querystring = require('querystring');

var hop = {}.hasOwnProperty;

function HandlingState(req, res) {
  this.underlyingReq = req;
  this.underlyingRes = res;
  this.request = null;
  this.response = null;
  this.streaming = false;
}

function RequestHandler(next, Request) {
  events.EventEmitter.call(this);

  if (typeof next !== 'function') {
    throw new TypeError('Expected `next` to be a function.');
  }
  if (typeof Request !== 'function' && typeof Request !== 'undefined') {
    throw new TypeError('Expected `Request` to be a function.');
  }

  this.next = next;
  this.Request = Request || DefaultRequest;

  this._activePromises = [];
  this._errorResponses = {};
}

nativeUtil.inherits(RequestHandler, events.EventEmitter);

module.exports = RequestHandler;

RequestHandler.prototype.DEFAULT_JSON_CONTENT_TYPE =
    'application/json; charset=utf-8';
RequestHandler.prototype.DEFAULT_FORM_CONTENT_TYPE =
    'application/x-www-form-urlencoded; charset=utf-8';

RequestHandler.prototype.observe = function(server) {
  var handler = this;
  server.on('request', function(req, res) {
    handler._handle(req, res);
  });
};

RequestHandler.prototype.setErrorResponse = function(response) {
  this._assertResponse(response, true, false);
  this._errorResponses[response.statusCode] = response;
};

RequestHandler.prototype.cancelAll = function() {
  var active = this._activePromises.slice();
  active.forEach(function(promise) {
    promise.cancel();
  });
};

RequestHandler.prototype._allowBody = function(request, response) {
  var statusCode = response.statusCode;
  return request.method !== 'HEAD' &&
    statusCode !== 204 && statusCode !== 304 &&
    (100 > statusCode || statusCode > 199);
};

RequestHandler.prototype._assertResponse = function(response, allowBody,
    chunkOnly) {

  if (!response || typeof response !== 'object') {
    throw new TypeError('Expected response to be an object.');
  }

  var statusCode = response.statusCode;
  if (typeof statusCode !== 'number' || !isFinite(statusCode)) {
    throw new TypeError('Expected `statusCode` to be a number.');
  }

  if (hop.call(response, 'headers')) {
    if (!response.headers || typeof response.headers !== 'object') {
      throw new TypeError('Expected `headers` to be an object.');
    }

    var headers = response.headers;
    var encountered = {};
    Object.keys(headers).forEach(function(header) {
      if (!header) {
        throw new TypeError('Unexpected empty header name.');
      }

      var lowercased = header.toLowerCase();
      if (hop.call(encountered, lowercased)) {
        throw new TypeError('Unexpected duplicate `' + header + '` header.');
      }
      encountered[lowercased] = util.validHeaderValue(headers[header], header);
    });
  }

  if (hop.call(response, 'stream')) {
    if (!response.stream || typeof response.stream.pipe !== 'function') {
      throw new TypeError('Expected `stream` to be pipe()able.');
    }

    if (!allowBody) {
      throw new TypeError('Response contains `stream` but no body is allowed.');
    }
    if (chunkOnly) {
      throw new TypeError(
          'Response contains `stream` but only `chunk` is allowed.');
    }

    if (hop.call(response, 'chunk')) {
      throw new TypeError(
          'Unexpected `chunk` value when `stream` is present.');
    }
    if (hop.call(response, 'json')) {
      throw new TypeError(
          'Unexpected `json` value when `stream` is present.');
    }
    if (hop.call(response, 'form')) {
      throw new TypeError(
          'Unexpected `form` value when `stream` is present.');
    }
  }

  if (hop.call(response, 'chunk')) {
    if (!Buffer.isBuffer(response.chunk)) {
      throw new TypeError('Expected `chunk` to be a buffer.');
    }

    if (hop.call(response, 'json')) {
      throw new TypeError(
          'Unexpected `json` value when `chunk` is present.');
    }
    if (hop.call(response, 'form')) {
      throw new TypeError(
          'Unexpected `form` value when `chunk` is present.');
    }
  }

  if (hop.call(response, 'json')) {
    if (typeof response.json === 'undefined') {
      throw new TypeError('Unexpected undefined value for `json`.');
    }

    if (chunkOnly) {
      throw new TypeError(
          'Response contains `json` but only `chunk` is allowed.');
    }

    if (hop.call(response, 'form')) {
      throw new TypeError('Unexpected `form` value when `json` is present.');
    }
  }

  if (hop.call(response, 'form')) {
    if (!response.form || typeof response.form !== 'object') {
      throw new TypeError('Expected `form` to be an object.');
    }

    if (chunkOnly) {
      throw new TypeError(
          'Response contains `form` but only `chunk` is allowed.');
    }
  }
};

RequestHandler.prototype._handle = function(req, res) {
  var state = new HandlingState(req, res);
  var promise;
  try {
    state.request = new this.Request(req);
    this.emit('request', state);
    var result = this.next(state.request);
    if (!Promise.isInstance(result)) {
      result = Promise.from(result);
    }
    promise = this._writeResponse(result, state);
    res.on('close', promise.cancel);
  } catch (error) {
    promise = Promise.rejected(error);
  }

  var handler = this;
  this._trackActivity(promise.otherwise(function(reason) {
    handler._handleError(reason, state);
  }));
};

RequestHandler.prototype._handleError = function(error, state) {
  var statusCode = 500;
  if (error && error.name === 'cancel') {
    statusCode = 503;
    this.emit('cancelError', error, state);
  } else if (error && error.name === 'timeout') {
    statusCode = 504;
    this.emit('timeoutError', error, state);
  } else {
    this.emit('internalError', error, state);
  }

  // Try and end the response if no headers were sent yet. Assumes whatever
  // sent the headers did not crash prior to ending the response.
  var req = state.underlyingReq, res = state.underlyingRes;
  if (!res.headersSent) {
    if (this._errorResponses.hasOwnProperty(statusCode)) {
      var response = this._errorResponses[statusCode];
      res.writeHead(statusCode, response.headers);
      if (req.method !== 'HEAD') {
        res.end(response.chunk);
      } else {
        res.end();
      }
    } else {
      res.writeHead(statusCode);
      res.end();
    }
  }
};

RequestHandler.prototype._trackActivity = function(promise) {
  var activePromises = this._activePromises;
  promise.ensure(function() {
    activePromises.splice(activePromises.indexOf(promise), 1);
  });
  activePromises.push(promise);
};

RequestHandler.prototype._writeResponse = function(promise, state) {
  var handler = this;
  return promise.then(function(response) {
    var allowBody = handler._allowBody(state.request, response);

    state.response = response;
    handler._assertResponse(response, allowBody, false);

    var stream, chunk;
    var res = state.underlyingRes;
    if (response.stream) {
      if (Readable.isInstance(response.stream)) {
        stream = response.stream;
      } else {
        stream = Readable.from(response.stream);
      }
    } else if (response.json) {
      // Assumes writeHead() takes care of overriding what we set here, if
      // content-type is also in response.headers.
      res.setHeader('content-type', handler.DEFAULT_JSON_CONTENT_TYPE);
      chunk = new Buffer(JSON.stringify(response.json), 'utf8');
    } else if (response.form) {
      res.setHeader('content-type', handler.DEFAULT_FORM_CONTENT_TYPE);
      chunk = new Buffer(querystring.stringify(response.form), 'utf8');
    } else if (response.chunk) {
      chunk = response.chunk;
    }

    handler.emit('response', response, state);
    if (!allowBody && chunk) {
      handler.emit('responseBodyIgnored', response, state);
    }

    res.writeHead(response.statusCode, response.headers);
    if (stream) {
      state.streaming = true;
      stream.pipe(res);
    } else if (allowBody) {
      res.end(chunk);
    } else {
      res.end();
    }

    return new Promise(function(resolve, reject) {
      if (stream) {
        stream.otherwise(function(reason) {
          // Assuming streaming may fail due to an error in producing the data,
          // or because the response socket has errors or is closed.
          handler.emit('responseError', reason, state);
          reject(reason);

          // Ensure we fail hard when streaming fails.
          res.destroy();
        });
      }

      // Regardless, resolve when all data has been flushed to the
      // underlying system.
      res.on('finish', function() {
        handler.emit('responseFinished', state);
        resolve();
      });

      // Note: If the response socket is closed before sending the response has
      // finished, or streaming has failed, this promise should be cancelled
      // due to the 'close' listener set up in #_handle(). We don't need to
      // set up our own onCancelled calback here.
    });
  });
};
