'use strict';

var blessed = require('legendary/lib/blessed');

function Response(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof Response)) {
    return new Response(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}

module.exports = blessed.extended(Response);
