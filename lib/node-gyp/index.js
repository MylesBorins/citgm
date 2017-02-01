'use strict';

// node modules
var path = require('path');
var fs = require('fs');

// local modules
var spawn = require('../spawn');
var createOptions = require('../create-options');

function rebuild(context, next) {
  var options =
    createOptions(
      path.join(context.path, context.module.name), context);
  var args = ['rebuild'];
  var bailed = false;
  context.emit('data', 'info',
    context.module.name + ' node-gyp:', 'rebuild started');

  if (context.options.nodedir) {
    var nodedir = path.resolve(process.cwd(), context.options.nodedir);
    options.env.npm_config_nodedir = nodedir;
    args.push('--nodedir="' + nodedir + '"');
    context.emit('data', 'verbose',
      context.module.name + ' nodedir', 'Using --nodedir="' + nodedir + '"');
  }

  var proc = spawn('node-gyp', args, options);

  // default timeout to 10 minutes if not provided
  var timeout = setTimeout(cleanup,
      context.options.timeoutLength || 1000 * 60 * 10);

  function cleanup() {
    clearTimeout(timeout);
    bailed = true;
    context.emit('data', 'error',
      context.module.name + ' node-gyp:', 'Rebuild Timed Out');
    proc.kill();
    return next(Error('Rebuild Timed Out'));
  }

  proc.stderr.on('data', function (chunk) {
    context.emit('data', 'warn',
      context.module.name + ' node-gyp-rebuild:', chunk.toString());
  });

  proc.stdout.on('data', function (chunk) {
    context.emit('data', 'verbose',
      context.module.name + ' node-gyp-rebuild:', chunk.toString());
  });

  proc.on('error', function() {
    bailed = true;
    clearTimeout(timeout);
    return next(new Error(context.module.name + ' node-gyp: Rebuild Failed'));
  });

  proc.on('close', function(code) {
    if (bailed) return;
    clearTimeout(timeout);
    if (code > 0) {
      return next(Error(context.module.name + ' node-gyp: Rebuild Failed'));
    }
    context.emit('data', 'info',
      context.module.name + ' node-gyp:', 'rebuild successfully completed');
    return next(null, context);
  });
}

function rebuildBootstrap(context, next) {
  if (!context.options.rebuild) return next(null, context);
  var gypFilePath = path.join(context.path, context.module.name, 'binding.gyp');
  fs.access(gypFilePath, function (err) {
    if (err) {
      context.emit('data', 'warn', context.module.name + ' node-gyp:',
        'no bindings.gyp found, rebuild skipped');
      return next(null, context);
    }
    return rebuild(context, next);
  });
}

module.exports = {
  rebuild: rebuildBootstrap
};
