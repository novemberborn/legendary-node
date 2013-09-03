'use strict';

function Json(response) {
  this.response = response;
}

module.exports = Json;

Json.prototype.parse = function(length) {
  return this.response.stream.toBuffer(length).then(function(chunk) {
    return JSON.parse(chunk.toString('utf8'));
  });
};
