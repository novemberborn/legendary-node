'use strict';

function EndOfStreamError(message) {
  this.name = 'end-of-stream';
  this.message = message;
}

EndOfStreamError.prototype = new Error();
EndOfStreamError.prototype.constructor = EndOfStreamError;
EndOfStreamError.prototype.name = 'end-of-stream';
EndOfStreamError.prototype.stack = null;
EndOfStreamError.prototype.inspect = function() {
  return '[EndOfStreamError]';
};

module.exports = EndOfStreamError;
