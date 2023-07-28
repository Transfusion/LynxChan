'use strict';

var formOps = require('../engine/formOps');
var bypassOps = require('../engine/bypassOps');
var lang = require('../engine/langOps').languagePack;
var logger = require('../logger');
var modOps = require('../engine/modOps').ipBan.specific;
var mandatoryParameters = [ 'banId', 'appeal' ];

exports.appealBan = function(ip, bypass, parameters, res, language, json) {

  if (formOps.checkBlankParameters(parameters, mandatoryParameters, res,
      language, json)) {
    return;
  }

  modOps.appealBan(ip, bypass, parameters, language,
      function banAppealed(error) {
        if (error) {
          formOps.outputError(error, 500, res, language, json);
        } else {
          formOps.outputResponse(json ? 'ok' : lang(language).msgBanAppealed,
              json ? null : '/', res, null, null, language, json);
        }
      });

};

exports.process = function(req, res) {

  formOps.getPostData(req, res, function gotData(auth, parameters) {

    bypassOps.checkBypass(formOps.getCookies(req).bypass,
        function checkedBypass(error, bypass) {

          var json = formOps.json(req);

          if (error) {
            return formOps.outputError(error, 500, res, req.language, json);
          }

          exports.appealBan(logger.ip(req), bypass ? bypass._id : undefined,
              parameters, res, req.language, json);

        });

  });

};