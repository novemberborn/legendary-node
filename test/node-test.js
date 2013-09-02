'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('legendary/test/sentinels');

var node = require('../').node;
var Promise = require('../').Promise;
var Collection = require('../').Collection;

describe('node.wrap(func)', function() {
  it('returns a function', function() {
    assert.isFunction(node.wrap(function() {}));
  });

  describe('the returned function', function() {
    it('results in a Promise', function() {
      assert.instanceOf(node.wrap(function() {})(), Promise);
    });

    it('invokes original method', function() {
      var spy = sinon.spy(function(arg1, arg2, cb) {
        /*jshint unused:false*/
      });
      var wrapped = node.wrap(spy);
      wrapped.call(sentinels.one, sentinels.two, sentinels.three);

      assert.calledOnce(spy);
      assert.calledOn(spy, sentinels.one);
      assert.calledWithMatch(spy,
          sinon.match.same(sentinels.two),
          sinon.match.same(sentinels.three),
          sinon.match.func);
    });

    it('rejects if the callback is invoked with truthy error', function() {
      return assert.isRejected(
          node.wrap(function(cb) { cb(sentinels.one); })(),
          sentinels.Sentinel);
    });

    it('resolves if the callback is invoked with a falsy error', function() {
      return assert.eventually.strictEqual(
          node.wrap(function(cb) { cb(null, sentinels.one); })(),
          sentinels.one);
    });

    it('resolves with an array if the callback is invoked with a falsy error ' +
        'and multiple values',
        function() {
          return assert.eventually.deepEqual(
              node.wrap(function(cb) {
                cb.apply(null, [null].concat(sentinels.arr()));
              })(),
              sentinels.arr());
        });
  });

  it('allows configuration of the returned promise class', function() {
    assert.instanceOf(
        node.wrap(function() {}, null, Collection)(),
        Collection);
  });

  it('correctly wraps functions that don’t declare their callback argument',
      function() {
        function func(v) { arguments[arguments.length - 1](null, v); }
        return assert.eventually.strictEqual(
            node.wrap(func, true)(sentinels.one),
            sentinels.one);
      });
});
