'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');

var util = require('../../lib/http/util');

describe('http.util.validHeaderValue(value, header)', function() {
  it('includes `header` name in error message', function() {
    assert.throws(function() {
      util.validHeaderValue(null, 'foo');
    }, 'Unexpected value for `foo` header.');
  });

  it('rejects objects', function() {
    assert.throws(function() {
      util.validHeaderValue({});
    }, TypeError);
  });

  it('rejects `null`', function() {
    assert.throws(function() {
      util.validHeaderValue(null);
    }, TypeError);
  });

  it('rejects `undefined`', function() {
    assert.throws(function() {
      util.validHeaderValue(undefined);
    }, TypeError);
  });

  it('rejects non-finite numbers', function() {
    assert.throws(function() {
      util.validHeaderValue(Infinity);
    }, TypeError);
  });

  it('casts strings to strings', function() {
    assert.strictEqual(util.validHeaderValue('foo'), 'foo');
  });

  it('casts numbers to strings', function() {
    assert.strictEqual(util.validHeaderValue(42), '42');
  });

  it('casts booleans to strings', function() {
    assert.strictEqual(util.validHeaderValue(true), 'true');
    assert.strictEqual(util.validHeaderValue(false), 'false');
  });

  it('recurses for arrays', function() {
    var spy = sinon.spy(util, 'validHeaderValue');
    var result = util.validHeaderValue(['foo', 42, true, false], 'bar');
    assert.deepEqual(result, ['foo', '42', 'true', 'false']);
    assert.callCount(spy, 5);
    assert.calledWithExactly(spy, 'foo', 'bar');
    assert.calledWithExactly(spy, 42, 'bar');
    assert.calledWithExactly(spy, true, 'bar');
    assert.calledWithExactly(spy, false, 'bar');
  });
});

describe('http.util.validQueryValue(value, param)', function() {
  it('includes `param` name in error message', function() {
    assert.throws(function() {
      util.validQueryValue(null, 'foo');
    }, 'Unexpected value for `foo` param.');
  });

  it('rejects objects', function() {
    assert.throws(function() {
      util.validQueryValue({});
    }, TypeError);
  });

  it('rejects arrays', function() {
    assert.throws(function() {
      util.validQueryValue([]);
    }, TypeError);
  });

  it('rejects `null`', function() {
    assert.throws(function() {
      util.validQueryValue(null);
    }, TypeError);
  });

  it('rejects `undefined`', function() {
    assert.throws(function() {
      util.validQueryValue(undefined);
    }, TypeError);
  });

  it('rejects non-finite numbers', function() {
    assert.throws(function() {
      util.validQueryValue(Infinity);
    }, TypeError);
  });

  it('casts strings to strings', function() {
    assert.strictEqual(util.validQueryValue('foo'), 'foo');
  });

  it('casts numbers to strings', function() {
    assert.strictEqual(util.validQueryValue(42), '42');
  });

  it('casts booleans to strings', function() {
    assert.strictEqual(util.validQueryValue(true), 'true');
    assert.strictEqual(util.validQueryValue(false), 'false');
  });
});
