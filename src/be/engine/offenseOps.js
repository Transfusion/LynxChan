'use strict';

var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var logger = require('../logger');
var db = require('../db');
var latestOps;
var bans = db.bans();
var offenseRecords = db.offenseRecords();
var threads = db.threads();
var posts = db.posts();
var lang;
var clearIpMinRole;

exports.loadSettings = function() {

  var settings = require('../settingsHandler').getGeneralSettings();
  clearIpMinRole = settings.clearIpMinRole;

};

exports.loadDependencies = function() {

  lang = require('./langOps').languagePack;
  latestOps = require('./boardOps').latest;

};

exports.runReadQuery = function(ip, bypassId, callback) {

  var orList = [];

  if (ip) {
    orList.push({
      ip : ip
    });
  }

  if (bypassId) {
    orList.push({
      bypassId : bypassId
    });
  }

  offenseRecords.find({
    $or : orList
  }, {
    projection : {
      _id : 0,
      ip : 0,
      bypassId : 0
    }
  }).toArray(callback);

};

exports.fetchBan = function(userData, parameters, language, callback) {

  try {
    var banId = new ObjectID(parameters.banId);
  } catch (error) {
    return callback(null, []);
  }

  bans.findOne({
    _id : banId
  }, function(error, ban) {

    if (error) {
      callback(error);
    } else if (!latestOps.canSearchPerBan(ban, userData)) {
      callback(lang(language).errDeniedOffenseHistory);
    } else {
      exports.runReadQuery(ban.ip, ban.bypassId, callback);
    }
  });

};

exports.sanitizeIp = function(parameters) {

  if (!parameters.ip) {
    return;
  }

  parameters.convertedIp = logger.convertIpToArray(parameters.ip);

  for (var i = 0; i < parameters.convertedIp.length; i++) {

    if (Number.isNaN(parameters.convertedIp[i])) {
      delete parameters.ip;
      delete parameters.convertedIp;

      return;
    }
  }

};

exports.getOffenses = function(userData, parameters, language, callback) {

  exports.sanitizeIp(parameters);

  if (parameters.ip && userData.globalRole <= clearIpMinRole) {
    return exports.runReadQuery(parameters.convertedIp, null, callback);
  }

  if (parameters.banId) {
    return exports.fetchBan(userData, parameters, language, callback);
  } else if (!latestOps.canSearchPerPost(parameters, userData)) {
    return callback(lang(language).errDeniedOffenseHistory);
  }

  if (parameters.boardUri && parameters.boardUri.match(/\W/g)) {
    parameters.boardUri = '';
  }

  var query = {
    boardUri : parameters.boardUri
  };

  var fieldToUse = parameters.threadId ? 'threadId' : 'postId';

  query[fieldToUse] = +(parameters.threadId || parameters.postId);

  delete parameters.threadId;
  delete parameters.postId;

  parameters[fieldToUse] = query[fieldToUse];

  (parameters.threadId ? threads : posts).findOne(query, {
    _id : 0,
    ip : 1,
    bypassId : 1
  }, function(error, posting) {

    if (error || !posting || (!posting.ip && !posting.bypassId)) {
      callback(error, []);
    } else {
      exports.runReadQuery(posting.ip, posting.bypassId, callback);
    }

  });

};