'use strict';

var blessed = require('legendary/lib/blessed');
var streams = require('../streams');
var util = require('./util');
var parsers = require('./parsers');

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
      return this.then(getStatusCode);
    }
  },

  headers: {
    configurable: true,
    get: function() {
      return this.then(getHeaders);
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

Response.prototype.getHeader = function(header) {
  return this.then(function(r) {
    return r.headers[header.toLowerCase()];
  });
};

Response.prototype.parseContent = function(mediaType) {
  var response = this;
  return this.then(function(r) {
    if (!mediaType) {
      mediaType = util.parseMediaType(r.headers['content-type']);
    }

    var contentLength;
    if (r.headers['content-length']) {
      contentLength = parseInt(r.headers['content-length'], 10);
      if (isNaN(contentLength)) {
        throw new TypeError(
            'Invalid content-length `' + r.headers['content-length'] + '`.');
      }
    }

    var Parser = parsers.get(mediaType);
    return new Parser(response).parse(contentLength);
  });
};
