'use strict';

var assert = require('chai').assert;
var optionSentinels = require('./sentinels');

var Transport = require('../../../').http.transports.Transport;
var SSL = require('../../../').http.transports.SSL;

describe('http.transports.SSL(options)', function() {
  it('extends Transport', function() {
    assert.instanceOf(new SSL({}), Transport);
  });

  it('throws without options', function() {
    assert.throws(function() { return new Transport(); },
        TypeError, 'Expected `options` object.');
  });

  it('takes `hostname`, `port` and `agent` from `options`', function() {
    var t = new SSL({
      hostname: optionSentinels.hostname,
      port: optionSentinels.port,
      agent: optionSentinels.agent
    });

    assert.propertyVal(t, 'hostname', optionSentinels.hostname);
    assert.propertyVal(t, 'port', optionSentinels.port);
    assert.propertyVal(t, 'agent', optionSentinels.agent);
  });

  it('provides defaults for `hostname` and `port`', function() {
    var t = new SSL({});
    assert.propertyVal(t, 'hostname', 'localhost');
    assert.propertyVal(t, 'port', 443);
    assert.isUndefined(t.agent);
  });
});
