'use strict';

var Promise = require('../').Promise;

var slice = [].slice;

exports.wrap = function(func, callbackNotDeclared, Constructor) {
  if (!Constructor) {
    Constructor = Promise;
  }

  var arity = func.length;
  return function() {
    var thisArg = this;
    var args = slice.call(arguments);

    if (callbackNotDeclared === true) {
      arity = args.length + 1;
    }
    arguments.length = arity;

    return new Constructor(function(resolve, reject) {
      args[arity - 1] = function(err, value) {
        if (err) {
          reject(err);
        } else if (arguments.length > 2) {
          resolve(slice.call(arguments, 1));
        } else {
          resolve(value);
        }
      };

      func.apply(thisArg, args);
    });
  };
};
