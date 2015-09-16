'use strict';

var fs = require('fs');

var archiveSettings;
var fePath;
var dbSettings;
var generalSettings;
var tempDirectory;
var templateSettings;

// Section 1: New settings {
function broadCastReload(reloadsToMake, callback) {

  process.send({
    upStream : true,
    reload : true,
    rebuilds : reloadsToMake
  });

  callback();

}

function checkGeneralSettingsChanged(settings, reloadsToMake, callback) {

  var rebuildFP = generalSettings.siteTitle !== settings.siteTitle;

  var topChanged = generalSettings.topBoardsCount !== settings.topBoardsCount;

  // did the amount of latest posts appearing on the front page changes?
  var lPC = generalSettings.globalLatestPosts !== settings.globalLatestPosts;

  rebuildFP = rebuildFP || topChanged || lPC;

  if (rebuildFP) {
    reloadsToMake.push({
      frontPage : true
    });
  }

  var rebuildBoards = generalSettings.pageSize !== settings.pageSize;
  var fileSizeDelta = generalSettings.maxFileSizeMB !== settings.maxFileSizeMB;

  rebuildBoards = rebuildBoards || fileSizeDelta;

  if (rebuildBoards) {
    reloadsToMake.push({
      allBoards : true
    });
  }

  broadCastReload(reloadsToMake, callback);

  if (!settings.allowBoardCustomJs && generalSettings.allowBoardCustomJs) {
    require('./engine/boardOps').custom.clearCstomJs();
  }
}

function checkSettingsChanges(settings, callback) {
  var reloadsToMake = [];

  if (generalSettings.fePath !== settings.fePath) {
    reloadsToMake.push({
      globalRebuild : true
    });

    broadCastReload(reloadsToMake, callback);
    return;
  }

  checkGeneralSettingsChanged(settings, reloadsToMake, callback);

}

exports.setNewSettings = function(settings, callback) {

  fs.writeFile(__dirname + '/settings/general.json', new Buffer(JSON.stringify(
      settings, null, 2), 'utf-8'), function wroteFile(error) {
    if (error) {
      callback(error);
    } else {

      var exceptionalFields = [ 'siteTitle', 'captchaFonts',
          'languagePackPath', 'defaultAnonymousName', 'defaultBanMessage',
          'disableTopBoards', 'allowBoardCustomJs', 'topBoardsCount',
          'globalLatestPosts' ];

      for ( var key in generalSettings) {
        if (!settings[key] && exceptionalFields.indexOf(key) === -1) {
          settings[key] = generalSettings[key];
        }
      }

      checkSettingsChanges(settings, callback);
    }
  });

};
// } Section 1: New settings

// Section 2: Load settings {
function loadDatabasesSettings() {
  var dbSettingsPath = __dirname + '/settings/db.json';

  dbSettings = JSON.parse(fs.readFileSync(dbSettingsPath));

  try {
    var archivePath = __dirname + '/settings/archive.json';

    archiveSettings = JSON.parse(fs.readFileSync(archivePath));
  } catch (error) {

  }
}

function loadGeneralSettings() {

  var defaultSettings = exports.getDefaultSettings();

  var generalSettingsPath = __dirname + '/settings/general.json';

  generalSettings = JSON.parse(fs.readFileSync(generalSettingsPath));

  for ( var key in defaultSettings) {
    if (!generalSettings[key]) {
      generalSettings[key] = defaultSettings[key];
    }
  }

}

function setMaxSizes() {
  if (generalSettings.maxFileSizeMB !== Infinity) {
    generalSettings.maxFileSizeB = generalSettings.maxFileSizeMB * 1024 * 1024;
  } else {
    generalSettings.maxFileSizeB = Infinity;
  }

  var requestSizeB = generalSettings.maxRequestSizeMB * 1024 * 1024;
  generalSettings.maxRequestSizeB = requestSizeB;

  var bannerSizeB = generalSettings.maxBannerSizeKB * 1024;
  generalSettings.maxBannerSizeB = bannerSizeB;

  var flagSizeB = generalSettings.maxFlagSizeKB * 1024;
  generalSettings.maxFlagSizeB = flagSizeB;

}

exports.loadSettings = function() {

  loadDatabasesSettings();

  loadGeneralSettings();

  fePath = generalSettings.fePath;

  tempDirectory = generalSettings.tempDirectory || '/tmp';

  setMaxSizes();

  var templateSettingsPath = fePath + '/templateSettings.json';

  templateSettings = JSON.parse(fs.readFileSync(templateSettingsPath));

  require('./engine/langOps').init();

};
// } Section 2: Load settings

exports.getDefaultSettings = function() {

  return {
    address : '0.0.0.0',
    port : 80,
    fePath : __dirname + '/../fe',
    tempDirectory : '/tmp',
    pageSize : 10,
    latestPostCount : 5,
    maxBoardTags : 5,
    autoSageLimit : 500,
    maxFiles : 3,
    maxThreadCount : 50,
    emailSender : 'noreply@mychan.com',
    captchaExpiration : 5,
    maxRequestSizeMB : 2,
    maxFileSizeMB : Infinity,
    acceptedMimes : [ 'image/png', 'image/jpeg', 'image/gif', 'image/bmp',
        'video/webm', 'audio/mpeg', 'video/mp4', 'video/ogg', 'audio/ogg',
        'audio/webm' ],
    logPageSize : 50,
    boardsPerPage : 50,
    torSource : 'https://check.torproject.org/exit-addresses',
    maxBoardRules : 20,
    thumbSize : 128,
    maxFilters : 20,
    maxBoardVolunteers : 20,
    maxBannerSizeKB : 200,
    maxFlagSizeKB : 32,
    floodTimerSec : 10,
    archiveLevel : 0,
    torAccess : 0,
    proxyAccess : 0,
    clearIpMinRole : 0,
    boardCreationRequirement : 4
  };

};

exports.getDbSettings = function() {

  return dbSettings;
};

exports.getFePath = function() {
  return fePath;
};

exports.getArchiveSettings = function() {
  return archiveSettings;
};

exports.getGeneralSettings = function() {
  return generalSettings;
};

exports.getTemplateSettings = function() {
  return templateSettings;
};