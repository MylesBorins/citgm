#!/usr/bin/env node
'use strict';
var yargs = require('yargs');
var os = require('os');

var async = require('async');
var _ = require('lodash');

var update = require('../lib/update');
var citgm = require('../lib/citgm');
var logger = require('../lib/out');
var reporter = require('../lib/reporter');
var getLookup = require('../lib/lookup').get;
var commonArgs = require('../lib/common-args');
var isMatch = require('../lib/match-conditions');

yargs = commonArgs(yargs)
  .usage('citgm-all [options]')
  .option('fail-flaky', {
    alias: 'f',
    type: 'boolean',
    description: 'Ignore flaky flags. Don\'t ignore any failures.'
  });

var app = yargs.argv;

var log = logger({
  level: app.verbose,
  nocolor: app.color
});

update(log);

if (!app.su) {
  require('root-check')(); // silently downgrade if running as root...
                           // unless --su is passed
} else {
  log.warn('root', 'Running as root! Use caution!');
}

var options = {
  lookup: app.lookup,
  nodedir: app.nodedir,
  testPath: app.testPath,
  failFlaky: app.failFlaky,
  level: app.verbose,
  npmLevel: app.npmLoglevel,
  timeoutLength: app.timeout
};

var lookup = getLookup(options);
if (!lookup) {
  log.error('the json file cannot be found or there is an error in the file!');
  process.exit(1);
}

if (app.autoParallel) {
  app.parallel = os.cpus().length;
  log.info('cores', 'detected ' + app.parallel + ' cores on this system');
}
process.setMaxListeners(app.parallel + 1 || process.getMaxListeners());

if (!citgm.windows) {
  var uidnumber = require('uid-number');
  var uid = app.uid || process.getuid();
  var gid = app.gid || process.getgid();
  uidnumber(uid,gid, function(err, uid, gid) {
    options.uid = uid;
    options.gid = gid;
    launch(options);
  });
} else {
  launch(options);
}

var modules = [];

function runCitgm (mod, name, next) {
  if (isMatch(mod.skip)) {
    return next();
  }

  var runner = citgm.Tester(name, options);
  var bailed = false;

  function cleanup() {
    bailed = true;
    runner.cleanup();
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGHUP', cleanup);
    process.removeListener('SIGBREAK', cleanup);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGHUP', cleanup);
  process.on('SIGBREAK', cleanup);

  runner.on('start', function(name) {
    log.info('starting', name);
  }).on('fail', function(err) {
    log.error('failure', err.message);
  }).on('data', function(type,key,message) {
    log[type](key, message);
  }).on('end', function(result) {
    if (result.error) {
      log.error(result.name + ' done', 'done - the test suite for ' + result.name + ' version ' + result.version + ' failed');
    }
    else {
      log.info(result.name + ' done', 'done - the test suite for ' + result.name + ' version ' + result.version + ' passed.');
    }
    modules.push(result);
    if (!bailed) {
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGHUP', cleanup);
      process.removeListener('SIGBREAK', cleanup);
    }
    return next(bailed);
  }).run();
}

function runTask(task, next) {
  runCitgm(task.mod, task.name, next);
}

function filterLookup(result, value, key) {
  result.push({
    name: key,
    mod: value
  });
  return result;
}

function launch() {
  var collection = _.reduce(lookup, filterLookup, []);

  var q = async.queue(runTask, app.parallel || 1);
  q.push(collection);
  function done () {
    q.drain = null;
    reporter.logger(log, modules);

    if (app.markdown) {
      reporter.markdown(log.bypass, modules);
    }

    if (app.tap) {
      // if tap is a string it should be a path to write output to
      // if not use `log.bypass` which is currently process.stdout.write
      // TODO check that we can write to that path, perhaps require a flag to overwrite
      var tap = (typeof app.tap === 'string') ? app.tap : log.bypass;
      reporter.tap(tap, modules, app.append);
    }

    if (app.junit) {
      var junit = (typeof app.junit === 'string') ? app.junit : log.bypass;
      reporter.junit(junit, modules, app.append);
    }

    process.exit(reporter.util.hasFailures(modules));
  }

  function abort() {
    q.pause();
    q.kill();
    process.exitCode = 1;
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGHUP', abort);
    process.removeListener('SIGBREAK', abort);
    done();
  }

  q.drain = done;

  process.on('SIGINT', abort);
  process.on('SIGHUP', abort);
  process.on('SIGBREAK', abort);
}
