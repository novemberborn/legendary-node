'use strict';

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
