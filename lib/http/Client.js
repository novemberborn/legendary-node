'use strict';

var TransportOptions = require('./transports/Options');
var Response = require('./Response');
var util = require('./util');

function Client(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Expected `options` object.');
  }
  if (!options.transport) {
    throw new TypeError('Expected `transport` option.');
  }
  if (options.pathname) {
    if (typeof options.pathname !== 'string') {
      throw new TypeError('Expected `pathname` to be a string.');
    } else if (~options.pathname.indexOf('?')) {
      throw new TypeError('`pathname` cannot contain `?`');
    }
  }
  if (options.query &&
      (typeof options.query !== 'object' || Array.isArray(options.query))) {
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

Client.prototype.TransportOptions = TransportOptions;
Client.prototype.Response = Response;

Client.prototype._normalizeQuery = function(query) {
  if (!query) {
    return [];
  }

  return Object.keys(query).reduce(function(result, param) {
    result.push(param, util.validQueryValue(query[param], param));
    return result;
  }, []);
};

Client.prototype._normalizeHeaders = function(headers) {
  var result = [];
  var gotHost = false;

  Object.keys(headers).forEach(function(header) {
    var lowercased = header.toLowerCase();
    if (lowercased === 'host') {
      gotHost = true;
    }
    result.push(lowercased, util.validHeaderValue(headers[header], header));
  });

  if (!gotHost) {
    throw new TypeError('Expected `host` header`.');
  }

  return headers;
};

Client.prototype.request = function(method, options) {
  return this.transport.handle(
      new this.TransportOptions(this, method, options));
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
