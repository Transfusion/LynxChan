'use strict';

var formOps = require('../engine/formOps');
var settingsHandler = require('../settingsHandler');
var languageOps = require('../engine/langOps');
var lang = languageOps.languagePack;

exports.disableNewBypasses = function(auth, toggle, userData, res, language,
    json) {

  settingsHandler.toggleNewBypasses(userData, toggle, language,
      function(error) {
        if (error) {
          formOps.outputError(error, 500, res, language, json, auth);
        } else {

          formOps.outputResponse(
              json ? 'ok' : lang(language).msgBypassesToggled, json ? null
                  : '/globalManagement.js', res, null, auth, language, json);
        }
      });
};

exports.process = function(req, res) {

  formOps.getAuthenticatedPost(req, res, true, function gotData(auth, userData,
      parameters) {
    exports.disableNewBypasses(auth, !!parameters.disableNewBypasses, userData, res, req.language,
    formOps.json(req));
  });
};
