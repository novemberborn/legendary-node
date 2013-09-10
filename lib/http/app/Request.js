'use strict';

var Readable = require('../../../').streams.Readable;

var url = require('url');
var querystring = require('querystring');

function Request(req) {
  this.underlyingReq = req;

  this.method = req.method;
  this.headers = req.headers;
  this.host = req.headers.host;

  var parsed = url.parse(req.url);
  this.path = parsed.pathname + parsed.search;
  this.pathname = parsed.pathname;
  this.querystring = parsed.query;

  this._makeQueryObject = true;
  this._queryObject = null;
  this._makeStream = req.method !== 'GET' && req.method !== 'DELETE' &&
      req.method !== 'HEAD';
  this._stream = null;
}

module.exports = Request;

Object.defineProperties(Request.prototype, {
  query: {
    configurable: true,
    set: function(x) {
      this._makeQueryObject = false;
      this._queryObject = x;
    },
    get: function() {
      if (this._makeQueryObject) {
        this._makeQueryObject = false;
        this._queryObject = querystring.parse(this.querystring);
      }
      return this._queryObject;
    }
  },

  stream: {
    configurable: true,
    set: function(x) {
      this._makeStream = false;
      this._stream = x;
    },
    get: function() {
      if (this._makeStream) {
        this._makeStream = false;
        this._stream = Readable.from(this.underlyingReq);
      }
      return this._stream;
    }
  }
});
