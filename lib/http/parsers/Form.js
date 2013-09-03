'use strict';

var querystring = require('querystring');

function Form(response) {
  this.response = response;
}

module.exports = Form;

Form.prototype.parse = function(length) {
  return this.response.stream.toBuffer(length).then(function(chunk) {
    return querystring.parse(chunk.toString('utf8'));
  });
};
