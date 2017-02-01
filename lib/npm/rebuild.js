'use strict';

const path = require('path');

const createOptions = require('../create-options');
const spawn = require('../spawn');

function rebuild(context, next) {
  const options =
    createOptions(
      path.join(context.path, context.module.name), context);
  const args = ['rebuild', '--loglevel', context.options.npmLevel];
  let bailed = false;
  context.emit('data', 'info',
    context.module.name + ' npm:', 'rebuild started');

  if (context.options.nodedir) {
    const nodedir = path.resolve(process.cwd(), context.options.nodedir);
    options.env.npm_config_nodedir = nodedir;
    args.push('--nodedir="' + nodedir + '"');
    context.emit('data', 'verbose',
      context.module.name + ' nodedir', 'Using --nodedir="' + nodedir + '"');
  }

  const proc = spawn('npm', args, options);

  // Default timeout to 10 minutes if not provided
  const timeout = setTimeout(cleanup,
      context.options.timeoutLength || 1000 * 60 * 10);

  function cleanup() {
    clearTimeout(timeout);
    bailed = true;
    context.emit('data', 'error',
      context.module.name + ' npm-rebuild:', 'Install Timed Out');
    proc.kill();
    return next(Error('Install Timed Out'));
  }

  proc.stderr.on('data', function (chunk) {
    context.emit('data', 'warn',
      context.module.name + ' npm-rebuild:', chunk.toString());
  });

  proc.stdout.on('data', function (chunk) {
    context.emit('data', 'verbose',
      context.module.name + ' npm-rebuild:', chunk.toString());
  });

  proc.on('error', function() {
    bailed = true;
    clearTimeout(timeout);
    return next(new Error(context.module.name + ' npm: Rebuild Failed'));
  });

  proc.on('close', function(code) {
    if (bailed) return;
    clearTimeout(timeout);
    if (code > 0) {
      return next(Error('npm: Rebuild Failed'));
    }
    context.emit('data', 'info',
      context.module.name + ' npm:', 'rebuild successfully completed');
    return next(null, context);
  });
}

function rebuildBootstrap(context, next) {
  if (context.options.rebuild) return rebuild(context, next);
  return next(null, context);
}

module.exports = rebuildBootstrap;
