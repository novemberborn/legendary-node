'use strict';

exports = module.exports = Object.create(require('legendary'));

exports.node = require('./lib/node');
exports.fs = require('./lib/fs');
exports.streams = require('./lib/streams');
exports.http = require('./lib/http');
