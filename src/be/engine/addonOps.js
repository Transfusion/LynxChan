'use strict';

// operations regarding addons

var fs = require('fs');
var debug = require('../kernel').debug();
var engineInfo = JSON.parse(fs.readFileSync(__dirname + '/../package.json'));
var addons;
var verbose;

exports.getEngineInfo = function() {
  return engineInfo;
};

exports.loadSettings = function() {

  var settings = require('../settingsHandler').getGeneralSettings();
  verbose = settings.verbose;
  addons = settings.addons;

  if (!addons) {
    return;
  }

  for (var i = 0; i < addons.length; i++) {

    try {

      var addon = require('../addons/' + addons[i]);

      if (addon.hasOwnProperty('loadSettings')) {
        addon.loadSettings();
      }

    } catch (error) {

      console.log('Could not load settings for addon ' + addons[i]);

      if (verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }

    }

  }

};

exports.versionsMatch = function(addonVersion, engineVersion) {

  addonVersion = addonVersion.split('.');
  engineVersion = engineVersion.split('.');

  for (var i = 0; i < addonVersion.length; i++) {
    if (addonVersion[i] !== engineVersion[i]) {
      return false;
    }
  }

  return true;
};

exports.testVersion = function(addonName, addonVersion, engineVersion) {

  if (!exports.versionsMatch(addonVersion, engineVersion)) {

    var msg = 'Engine version mismatch for addon ' + addonName;
    msg += '\nAddon engine version: ' + addonVersion + '\nEngine version: ';
    msg += engineVersion;

    if (verbose) {
      console.log(msg);
    }

    if (debug) {
      throw msg;
    }

  }

};

exports.initAddons = function(addons) {

  for (var i = 0; i < addons.length; i++) {

    var addon = addons[i];

    try {

      require('../addons/' + addon).init();
    } catch (error) {

      console.log('Could not initialize addon ' + addon);

      if (verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }

    }

  }

};

exports.testAddons = function(addons, engineInfo) {

  for (var i = 0; i < addons.length; i++) {

    var addon = addons[i];

    try {

      var loadedAddon = require('../addons/' + addon);

      if (verbose || debug) {

        exports.testVersion(addon, loadedAddon.engineVersion,
            engineInfo.version);
      }

    } catch (error) {

      console.log('Could not load addon ' + addon);

      if (verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }

    }

  }

};

exports.startAddons = function() {

  if (!addons || !addons.length) {
    return;
  }

  exports.testAddons(addons, engineInfo);

  exports.initAddons(addons);

};