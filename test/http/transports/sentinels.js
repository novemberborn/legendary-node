'use strict';

exports = module.exports = require('legendary/test/sentinels');

exports.hostname = new exports.Sentinel();
exports.port = new exports.Sentinel();
exports.agent = new exports.Sentinel();
exports.method = new exports.Sentinel();
exports.path = new exports.Sentinel();
exports.pathname = new exports.Sentinel();
exports.query = new exports.Sentinel();
exports.headers = new exports.Sentinel();
exports.auth = new exports.Sentinel();
