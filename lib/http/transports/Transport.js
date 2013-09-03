'use strict';

var http = require('http');

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

Transport.prototype.handle = function(options) {
  var request = this._makeRequest({
    hostname: this.hostname,
    port: this.port,
    agent: this.agent,
    method: options.method,
    path: options.path,
    headers: options.headers,
    auth: options.auth
  });

  return new options.Response(function(resolve, reject) {
    request.on('response', resolve);
    request.on('error', reject);

    if (options.body) {
      if (options.body.stream) {
        options.body.stream.pipe(request);
      } else {
        request.end(options.body.chunk);
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
