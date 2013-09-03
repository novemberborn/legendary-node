'use strict';

var http = require('http');
var Promise = require('../../../').Promise;

function Transport(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Expected `options` object.');
  }
  this.hostname = options.hostname || 'localhost';
  this.port = options.port || 80;
  this.agent = options.agent;
}

module.exports = Transport;

Transport.prototype._makeRequest = function(options) {
  return http.request(options);
};

Transport.prototype.handle = function(descriptor, Response) {
  if (!Response) {
    Response = Promise;
  }

  var request = this._makeRequest({
    hostname: this.hostname,
    port: this.port,
    agent: this.agent,
    method: descriptor.method,
    path: descriptor.path,
    headers: descriptor.headers,
    auth: descriptor.auth
  });

  return new Response(function(resolve, reject) {
    request.on('response', resolve);
    request.on('error', reject);

    if (descriptor.body) {
      if (descriptor.body.stream) {
        descriptor.body.stream.pipe(request);
      } else {
        request.end(descriptor.body.chunk);
      }
    } else {
      request.end();
    }

    return function() {
      request.removeListener('response', resolve);
      request.removeListener('error', reject);
      request.abort();
    };
  });
};
