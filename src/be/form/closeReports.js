'use strict';

var formOps = require('../engine/formOps');
var lang = require('../engine/langOps').languagePack();
var modOps = require('../engine/modOps').report;

function closeReport(userData, parameters, res, auth) {

  var reports = [];

  for ( var key in parameters) {

    if (!parameters.hasOwnProperty(key)) {
      continue;
    }

    if (!key.indexOf('report-')) {
      reports.push(key.substring(7));
    }

  }

  parameters.reports = reports;

  modOps.closeReports(userData, parameters, function reportClosed(error,
      global, board) {
    if (error) {
      formOps.outputError(error, 500, res);
    } else {

      var redirect = global ? '/globalManagement.js'
          : '/boardManagement.js?boardUri=' + board;

      formOps.outputResponse(lang.msgReportsClosed, redirect, res, null, auth);
    }

  });

}

exports.process = function(req, res) {

  formOps.getAuthenticatedPost(req, res, true, function gotData(auth, userData,
      parameters) {

    closeReport(userData, parameters, res, auth);

  });

};