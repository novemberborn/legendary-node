'use strict';

var Response = require('../../').http.Response;

var testConstructor = require('legendary/test/util').testConstructor;

describe('http.Response', function() {
  testConstructor(Response);
});
