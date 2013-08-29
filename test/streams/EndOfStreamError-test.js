'use strict';

var assert = require('chai').assert;
var sentinels = require('legendary/test/sentinels');

var EndOfStreamError = require('../../').streams.EndOfStreamError;

describe('EndOfStreamError', function() {
  it('extends Error', function() {
    assert.instanceOf(new EndOfStreamError(), Error);
  });

  it('has the expected shape', function() {
    var err = new EndOfStreamError();
    assert.propertyVal(err, 'name', 'end-of-stream');
    assert.propertyVal(err, 'stack', null);
    assert.isUndefined(err.message);
  });

  describe('EndOfStreamError#inspect()', function() {
    it('returns "[EndOfStreamError]"', function() {
      assert.equal(new EndOfStreamError().inspect(), '[EndOfStreamError]');
    });
  });

  it('can be given a message', function() {
    assert.strictEqual(new EndOfStreamError(sentinels.one).message, sentinels.one);
  });
});
