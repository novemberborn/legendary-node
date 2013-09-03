'use strict';

var util = require('../util');

var hop = {}.hasOwnProperty;

var STREAM_BODY = 1;
var CHUNK_BODY = 2;
var JSON_BODY = 3;
var FORM_BODY = 4;

function Options(client, method, options) {
  var extraHeaders, pathname, query, bodyType, body;
  if (options && typeof options === 'object') {
    if (hop.call(options, 'headers') && typeof options.headers !== 'object') {
      throw new TypeError('Expected `headers` to be an object.');
    }
    extraHeaders = options.headers;

    if (hop.call(options, 'pathname')) {
      if (options.pathname !== 'string') {
        throw new TypeError('Expected `pathname` to be a string.');
      } else if (~options.pathname.indexOf('?')) {
        throw new TypeError('`pathname` cannot contain `?`');
      }
      pathname = options.pathname;
    }

    if (hop.call(options, 'query') &&
        (!options.query || typeof options.query !== 'object')) {
      throw new TypeError('Expected `query` to be an object.');
    }
    query = options.query;

    if (hop.call(options, 'stream')) {
      if (!options.stream || typeof options.stream.pipe !== 'function') {
        throw new TypeError('Expected `stream` to be pipe()able.');
      }
      if (hop.call(options, 'chunk')) {
        throw new TypeError(
            'Unexpected `chunk` option when `stream` is present.');
      }
      if (hop.call(options, 'json')) {
        throw new TypeError(
            'Unexpected `json` option when `stream` is present.');
      }
      if (hop.call(options, 'form')) {
        throw new TypeError(
            'Unexpected `form` option when `stream` is present.');
      }
      bodyType = STREAM_BODY;
      body = options.stream;
    } else if (hop.call(options, 'chunk')) {
      if (!Buffer.isBuffer(options.chunk)) {
        throw new TypeError('Expected `chunk` to be a buffer.');
      }
      if (hop.call(options, 'json')) {
        throw new TypeError(
            'Unexpected `json` option when `chunk` is present.');
      }
      if (hop.call(options, 'form')) {
        throw new TypeError(
            'Unexpected `form` option when `chunk` is present.');
      }
      bodyType = CHUNK_BODY;
      body = options.chunk;
    } else if (hop.call(options, 'json')) {
      if (hop.call(options, 'form')) {
        throw new TypeError('Unexpected `form` option when `json` is present.');
      }
      bodyType = JSON_BODY;
      body = options.json;
    } else if (hop.call(options, 'form')) {
      if (!options.form || typeof options.form !== 'object') {
        throw new TypeError('Expected `form` to be an object.');
      }
      bodyType = FORM_BODY;
      body = options.form;
    }
  }

  this.Response = client.Response;
  this.method = method;
  this.path = this.buildPath(pathname, query, client.pathname, client.query);
  this.headers = this.buildHeaders(client.headers, extraHeaders);
  if (bodyType) {
    this.body = this.buildBody(bodyType, body);
  }
  this.auth = this.buildAuth(client.auth);
}

module.exports = Options;

Options.prototype.STREAM_BODY = STREAM_BODY;
Options.prototype.CHUNK_BODY = CHUNK_BODY;
Options.prototype.JSON_BODY = JSON_BODY;
Options.prototype.FORM_BODY = FORM_BODY;

Options.prototype.DEFAULT_JSON_CONTENT_TYPE =
    'application/json; charset=utf-8';
Options.prototype.DEFAULT_FORM_CONTENT_TYPE =
    'application/x-www-form-urlencoded; charset=utf-8';

Options.prototype.buildPath = function(pathname, query,
    defaultPathname, baseQuery) {

  if (!pathname) {
    pathname = defaultPathname;
  }

  var parts = this.buildQueryParts(query, baseQuery);
  if (parts.length) {
    pathname += '?' + parts.join('&');
  }

  return pathname;
};

Options.prototype.buildQueryParts = function(query, baseQuery) {
  var parts = [];
  if (baseQuery) {
    for (var i = 0, l = baseQuery.length; i < l; i += 2) {
      var param = baseQuery[i];
      if (!hop.call(query, param)) {
        var pair = encodeURIComponent(param) + '=' +
            encodeURIComponent(util.validQueryValue(baseQuery[i + 1], param));
        parts.push(pair);
      }
    }
  }

  if (query) {
    Object.keys(query).forEach(function(param) {
      var pair = encodeURIComponent(param) + '=' +
          encodeURIComponent(util.validQueryValue(query[param], param));
      parts.push(pair);
    });
  }

  return parts;
};

Options.prototype.buildHeaders = function(normalized, extra) {
  var headers = {};
  for (var i = 0, l = normalized.length; i < l; i += 2) {
    headers[normalized[i]] = normalized[i + 1];
  }
  if (extra) {
    Object.keys(extra).forEach(function(header) {
      var lowercased = header.toLowerCase();
      if (lowercased === 'host') {
        throw new TypeError('Can’t override `Host` header.');
      }
      headers[lowercased] = util.validHeaderValue(extra[header], header);
    });
  }
  return headers;
};

Options.prototype.buildBody = function(type, body) {
  if (type === STREAM_BODY) {
    return { stream: body };
  }

  if (type === CHUNK_BODY) {
    return { chunk: body };
  }

  if (type === JSON_BODY) {
    if (!hop.call(this.headers, 'content-type')) {
      this.headers['content-type'] = this.DEFAULT_JSON_CONTENT_TYPE;
    }

    return { chunk: new Buffer(JSON.stringify(body), 'utf8') };
  }

  if (type === FORM_BODY) {
    if (!hop.call(this.headers, 'content-type')) {
      this.headers['content-type'] = this.DEFAULT_FORM_CONTENT_TYPE;
    }

    var parts = this.buildQueryParts(body);
    return { chunk: new Buffer(parts.join('&'), 'utf8') };
  }

  throw new TypeError('Can’t build unsupported body type.');
};

Options.prototype.buildAuth = function(auth) {
  return auth;
};
