'use strict';

var Promise = require('../../').Promise;
var blessed = require('legendary/lib/blessed');
var streams = require('../streams');

function ClientResponse(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof ClientResponse)) {
    return new ClientResponse(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}

module.exports = blessed.extended(ClientResponse);

function getStatusCode(r) {
  return r.statusCode;
}

function getHeaders(r) {
  return r.headers;
}

Object.defineProperties(ClientResponse.prototype, {
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

ClientResponse.prototype.forApp = function() {
  var stream = this.stream;
  return this.then(function(r) {
    return {
      statusCode: getStatusCode(r),
      headers: getHeaders(r),
      stream: stream
    };
  }).to(Promise);
};
