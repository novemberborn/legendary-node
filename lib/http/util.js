'use strict';

function identity(x) { return x; }

var hop = {}.hasOwnProperty;

exports.validHeaderValue = function(value, header) {
  if (typeof value === 'string' ||
      typeof value === 'number' && isFinite(value) ||
      typeof value === 'boolean') {
    return value + '';
  }

  if (Array.isArray(value)) {
    return value.map(this._validHeaderValue);
  }

  throw new TypeError('Unexpected value for `' + header + '` header.');
};

exports.validQueryValue = function(value, param) {
  if (typeof value === 'string' ||
      typeof value === 'number' && isFinite(value) ||
      typeof value === 'boolean') {
    return value + '';
  }

  throw new TypeError('Unexpected value for `' + param + '` param.');
};

var SPLIT_MEDIA_TYPE = /(\/|\\|;|=|"| |\t)/;
var TEST_TOKEN = /^[!#$%&'*+-.^_`|~\d\w]+$/;
var TEST_QUOTED_STRING = /^[\t| |\x21|\x23-\x5B|\x5D-\x7E|\x80-\xFF]*$/;
var TEST_QUOTED_PAIR = /^[\t| |\x21-\xFE|\x80-\xFF]$/;
var TEST_TYPE = TEST_TOKEN;
var TEST_ATTRIBUTE = TEST_TOKEN;

function MediaType() {
  this.type = '';
  this.subtype = '';
  this.parameters = {};
}

MediaType.prototype.valueOf = function() {
  return this.type + '/' + this.subtype;
};

var TYPE = 1;
var SUBTYPE = 2;
var SEMICOLON = 3;
var ATTRIBUTE = 4;
var VALUE = 5;
var QUOTED_PAIR = 6;
exports.parseMediaType = function(value) {
  function fail() {
    throw new TypeError('Invalid media-type `' + value + '`.');
  }

  var result = new MediaType();

  var tokens = value.split(SPLIT_MEDIA_TYPE).filter(identity);
  var next = TYPE;
  var attr = '';
  var inQuote = false;
  for (
      var token = tokens.shift();
      typeof token === 'string';
      token = tokens.shift()) {
    switch (next) {
    case TYPE:
      if (token === '/') {
        next = SUBTYPE;
      } else if (!TEST_TYPE.test(token)) {
        fail();
      } else {
        result.type += token;
      }
      break;
    case SUBTYPE:
      if (token === ' ' || token === '\t') {
        next = SEMICOLON;
      } else if (token === ';') {
        next = ATTRIBUTE;
      } else if (!TEST_TYPE.test(token)) {
        fail();
      } else {
        result.subtype += token;
      }
      break;
    case SEMICOLON:
      if (token === ';') {
        next = ATTRIBUTE;
        attr = '';
      } else if (token !== ' ' && token !== '\t') {
        fail();
      }
      break;
    case ATTRIBUTE:
      if (token === '=') {
        if (!attr) {
          fail();
        } else {
          next = VALUE;
          attr = attr.toLowerCase();
          result.parameters[attr] = '';
        }
      } else if (!TEST_ATTRIBUTE.test(token)) {
        if (attr || (token !== ' ' && token !== '\t')) {
          fail();
        }
        // Ignore OWB
      } else {
        attr += token;
      }
      break;
    case VALUE:
      if (inQuote) {
        if (token === '"') {
          next = SEMICOLON;
          attr = '';
        } else if (token === '\\') {
          next = QUOTED_PAIR;
        } else if (!TEST_QUOTED_STRING.test(token)) {
          fail();
        } else {
          result.parameters[attr] += token;
        }
      } else if (token === '"') {
        inQuote = true;
      } else if (!TEST_TOKEN.test(token)) {
        fail();
      } else {
        result.parameters[attr] += token;
      }
      break;
    case QUOTED_PAIR:
      if (!TEST_QUOTED_PAIR.test(token[0])) {
        fail();
      } else {
        result.parameters[attr] += token[0];
        next = VALUE;
        if (token.length > 1) {
          tokens.unshift(token.slice(1));
        }
      }
      break;
    }
  }

  result.type = result.type.toLowerCase();
  result.subtype = result.subtype.toLowerCase();
  if (attr && !hop.call(result.parameters, attr)) {
    result.parameters[attr.toLowerCase()] = '';
  }

  return result;
};
