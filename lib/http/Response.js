'use strict';

var Promise = require('../../').Promise;
var blessed = require('legendary/lib/blessed');
var streams = require('../streams');

function Response(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof Response)) {
    return new Response(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}

module.exports = blessed.extended(Response);

function getStatusCode(r) {
  return r.statusCode;
}

function getHeaders(r) {
  return r.headers;
}

Object.defineProperties(Response.prototype, {
  statusCode: {
    configurable: true,
    get: function() {
      return this.then(getStatusCode).to(Promise);
    }
  },

  headers: {
    configurable: true,
    get: function() {
      return this.then(getHeaders).to(Promise);
    }
  },

  stream: {
    configurable: true,
    get: function() {
      if (!this._stream) {
        this._stream = this.to(streams.Readable);
      }
      return this._stream;
    }
  }
});
