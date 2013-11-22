'use strict';

var Promise = require('../').Promise;
var nativeFs = require('fs');
var node = require('./node');

[
  'appendFile', 'chmod', 'chown', 'close', 'fchmod', 'fchown', 'fdatasync',
  'fstat', 'fsync', 'ftruncate', 'futimes', 'lchmod', 'lchown', 'link',
  'lstat', 'mkdir', 'open', 'read', 'readFile', 'readdir', 'readlink',
  'realpath', 'rename', 'rmdir', 'stat', 'symlink', 'truncate', 'unlink',
  'utimes', 'write', 'writeFile'
].forEach(function(method) {
  if (typeof nativeFs[method] === 'function') {
    exports[method] = node.wrap(nativeFs[method]);
    exports[method + 'Sync'] = nativeFs[method];
  }
});

exports.exists = function(path) {
  return new Promise(function(resolve) {
    nativeFs.exists(path, resolve);
  });
};

exports.existsSync = nativeFs.existsSync;

[
  'createReadStream', 'createWriteStream', 'unwatchFile', 'watch', 'watchFile',
  'FSWatcher', 'ReadStream', 'Stats', 'WriteStream'
].forEach(function(method) {
  exports[method] = nativeFs[method];
});
