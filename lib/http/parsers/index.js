'use strict';

var hop = {}.hasOwnProperty;

exports.Json = require('./Json');
exports.Form = require('./Form');

exports.registry = {
  'application/json': exports.Json,
  'application/x-www-form-urlencoded': exports.Form
};

exports.add = function(type, parser) {
  exports.registry[type] = parser;
};

exports.alias = function(from, to) {
  if (!hop.call(exports.registry, type)) {
    throw new TypeError('No parser for `' + type + '`.');
  }

  exports.registry[to] = exports.registry[from];
};

exports.get = function(type) {
  var key = type.valueOf();

  if (!hop.call(exports.registry, key)) {
    throw new TypeError('No parser for `' + type + '`.');
  }

  return exports.registry[key];
};
