'use strict';

var util = require('../util');

var hop = {}.hasOwnProperty;

function RequestDescriptor(client, method, options) {
  this.method = method;
  this.path = this.buildPath(client.pathname, client.query, options);
  this.headers = this.buildHeaders(client.headers, options);
  this.body = this.buildBody(options);
  this.auth = this.buildAuth(client.auth, options);
}

module.exports = RequestDescriptor;

RequestDescriptor.prototype.DEFAULT_JSON_CONTENT_TYPE =
    'application/json; charset=utf-8';
RequestDescriptor.prototype.DEFAULT_FORM_CONTENT_TYPE =
    'application/x-www-form-urlencoded; charset=utf-8';

RequestDescriptor.prototype.buildPath = function(defaultPathname, baseQuery,
    options) {

  var path;
  if (hop.call(options, 'pathname')) {
    if (typeof options.pathname !== 'string' || options.pathname === '') {
      throw new TypeError('Expected `pathname` to be a non-empty string.');
    }
    path = options.pathname;
  } else {
    path = defaultPathname;
  }
  if (~path.indexOf('?')) {
    throw new TypeError('`pathname` cannot contain `?`.');
  }

  if (hop.call(options, 'query') &&
      (!options.query || typeof options.query !== 'object')) {
    throw new TypeError('Expected `query` to be an object.');
  }
  var pairs = this.buildQueryPairs(baseQuery, options.query);
  if (pairs.length) {
    path += '?' + pairs.join('&');
  }

  return path;
};

RequestDescriptor.prototype.buildQueryPairs = function(base, query) {
  var pairs = [];
  for (var i = 0, l = base.length; i < l; i += 2) {
    var param = base[i], value = base[i + 1];
    if (!query || !hop.call(query, param)) {
      pairs.push(encodeURIComponent(param) + '=' + encodeURIComponent(value));
    }
  }

  if (query) {
    Object.keys(query).forEach(function(param) {
      if (!param) {
        throw new TypeError('Unexpected empty param name.');
      }

      var pair = encodeURIComponent(param) + '=' +
          encodeURIComponent(util.validQueryValue(query[param], param));
      pairs.push(pair);
    });
  }

  return pairs;
};

RequestDescriptor.prototype.buildHeaders = function(base, options) {
  var headers = {};

  if (hop.call(options, 'headers')) {
    if (!options.headers || typeof options.headers !== 'object') {
      throw new TypeError('Expected `headers` to be an object.');
    }

    var extra = options.headers;
    Object.keys(extra).forEach(function(header) {
      if (!header) {
        throw new TypeError('Unexpected empty header name.');
      }

      var lowercased = header.toLowerCase();
      if (lowercased === 'host') {
        throw new TypeError('Can’t override `host` header.');
      }
      if (hop.call(headers, lowercased)) {
        throw new TypeError('Unexpected duplicate `' + header + '` header.');
      }
      headers[lowercased] = util.validHeaderValue(extra[header], header);
    });
  }

  for (var i = 0, l = base.length; i < l; i += 2) {
    if (!hop.call(headers, base[i])) {
      headers[base[i]] = base[i + 1];
    }
  }

  return headers;
};

RequestDescriptor.prototype.buildBody = function(options) {
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

    return { stream: options.stream };
  }

  if (hop.call(options, 'chunk')) {
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

    return { chunk: options.chunk };
  }

  if (hop.call(options, 'json')) {
    if (typeof options.json === 'undefined') {
      throw new TypeError('Unexpected undefined value for `json`.');
    }
    if (hop.call(options, 'form')) {
      throw new TypeError('Unexpected `form` option when `json` is present.');
    }

    if (!hop.call(this.headers, 'content-type')) {
      this.headers['content-type'] = this.DEFAULT_JSON_CONTENT_TYPE;
    }

    return { chunk: new Buffer(JSON.stringify(options.json), 'utf8') };
  }

  if (hop.call(options, 'form')) {
    if (!options.form || typeof options.form !== 'object') {
      throw new TypeError('Expected `form` to be an object.');
    }

    if (!hop.call(this.headers, 'content-type')) {
      this.headers['content-type'] = this.DEFAULT_FORM_CONTENT_TYPE;
    }

    var pairs = this.buildQueryPairs([], options.form);
    return { chunk: new Buffer(pairs.join('&'), 'utf8') };
  }

  return null;
};

RequestDescriptor.prototype.buildAuth = function(auth, options) {
  return auth;
};
