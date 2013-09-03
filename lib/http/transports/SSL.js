'use strict';

var https = require('https');
var nativeUtil = require('util');
var Transport = require('./Transport');

function SslTransport(options) {
  Transport.call(this, options);
  this.port = options.port || 443;
}

module.exports = SslTransport;

nativeUtil.inherits(SslTransport, Transport);

SslTransport.prototype._makeRequest = function(options) {
  return https.request(options);
};
