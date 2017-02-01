'use strict';

const fs = require('fs');
const path = require('path');

const createOptions = require('../create-options');
const spawn = require('../spawn');

function rebuild(context, next) {
  const options =
    createOptions(
      path.join(context.path, context.module.name), context);
  const args = ['rebuild'];
  let bailed = false;
  context.emit('data', 'info',
    context.module.name + ' node-gyp:', 'rebuild started');

  if (context.options.nodedir) {
    const nodedir = path.resolve(process.cwd(), context.options.nodedir);
    options.env.npm_config_nodedir = nodedir;
    args.push('--nodedir="' + nodedir + '"');
    context.emit('data', 'verbose',
      context.module.name + ' nodedir', 'Using --nodedir="' + nodedir + '"');
  }

  const proc = spawn('node-gyp', args, options);

  // Default timeout to 10 minutes if not provided
  const timeout = setTimeout(cleanup,
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
  const gypFilePath = path.join(
    context.path,
    context.module.name,
    'binding.gyp');
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
