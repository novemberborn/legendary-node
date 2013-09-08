'use strict';

var RequestDescriptor = require('./transports/RequestDescriptor');
var Response = require('./ClientResponse');
var util = require('./util');

var hop = {}.hasOwnProperty;

function Client(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Expected `options` object.');
  }
  if (!options.transport) {
    throw new TypeError('Expected `transport` option.');
  }
  if (hop.call(options, 'pathname')) {
    if (typeof options.pathname !== 'string' || options.pathname === '') {
      throw new TypeError('Expected `pathname` to be a non-empty string.');
    } else if (~options.pathname.indexOf('?')) {
      throw new TypeError('`pathname` cannot contain `?`.');
    }
  }
  if (hop.call(options, 'query') &&
      (!options.query || typeof options.query !== 'object')) {
    throw new TypeError('Expected `query` to be an object.');
  }
  if (!options.headers || typeof options.headers !== 'object') {
    throw new TypeError('Expected `headers` option (with `host`).');
  }

  this.transport = options.transport;

  this.pathname = options.pathname || '/';
  this.query = this._normalizeQuery(options.query);
  this.headers = this._normalizeHeaders(options.headers);
  this.auth = options.auth || null;
}

module.exports = Client;

Client.prototype.RequestDescriptor = RequestDescriptor;
Client.prototype.Response = Response;

Client.prototype._normalizeQuery = function(query) {
  if (!query) {
    return [];
  }

  return Object.keys(query).reduce(function(result, param) {
    if (!param) {
      throw new TypeError('Unexpected empty param name.');
    }

    result.push(param, util.validQueryValue(query[param], param));
    return result;
  }, []);
};

Client.prototype._normalizeHeaders = function(headers) {
  var result = [];

  var encountered = {};
  Object.keys(headers).forEach(function(header) {
    if (!header) {
      throw new TypeError('Unexpected empty header name.');
    }

    var lowercased = header.toLowerCase();
    if (hop.call(encountered, lowercased)) {
      throw new TypeError('Unexpected duplicate `' + header + '` header.');
    }

    encountered[lowercased] = true;
    result.push(lowercased, util.validHeaderValue(headers[header], header));
  });

  if (!encountered.host) {
    throw new TypeError('Expected `host` header`.');
  }

  return result;
};

Client.prototype.request = function(method, options) {
  return this.transport.handle(
      new this.RequestDescriptor(this, method, options || {}), this.Response);
};

Client.prototype.head = function(options) {
  return this.request('HEAD', options);
};

Client.prototype.get = function(options) {
  return this.request('GET', options);
};

Client.prototype.delete = function(options) {
  return this.request('DELETE', options);
};

Client.prototype.put = function(options) {
  return this.request('PUT', options);
};

Client.prototype.post = function(options) {
  return this.request('POST', options);
};

Client.prototype.patch = function(options) {
  return this.request('PATCH', options);
};
