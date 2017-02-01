'use strict';
const install = require('./install');
const test = require('./test');
const rebuild = require('./rebuild');

module.exports = {
  install: install,
  rebuild: rebuild,
  test: test
};
