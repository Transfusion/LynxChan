'use strict';

// Continues the boot of the application on worker treads.
// Initializes the systems
// Controls connection listeners

var logger = require('./logger');
var boot = require('./boot');
var verbose = boot.getGeneralSettings().verbose;
var cluster = require('cluster');
var fs = require('fs');
var requestHandler;

// paths
var fePath;

// boot variables
var booted = false;
var debug = boot.debug();

// functions
function main(req, res) {

  if (!booted) {
    req.connection.destroy();
    return;
  }

  if (debug) {
    try {
      clearCache();
      boot.loadSettings();
      require('./engine/domManipulator').loadTemplates();
    } catch (error) {
      console.log(error);
      req.connection.destroy();
      return;
    }

    require('./engine/requestHandler').handle(req, res);

  } else {
    requestHandler.handle(req, res);
  }

}

function startListening() {

  try {
    require('./engine/domManipulator').loadTemplates();

    if (boot.getGeneralSettings().ssl) {

      try {

        var options = {
          key : fs.readFileSync('server.key'),
          cert : fs.readFileSync('server.pem')
        };

        require('https').createServer(options, function(req, res) {
          main(req, res);
        }).listen(443, boot.getGeneralSettings().address);

      } catch (error) {
        console.log(error);
      }

    }

    require('http').createServer(function(req, res) {
      main(req, res);

    })
        .listen(boot.getGeneralSettings().port,
            boot.getGeneralSettings().address);

    booted = true;

    var message = 'Server worker ' + cluster.worker.id;
    message += ' booted at ' + logger.timestamp();

    requestHandler = require('./engine/requestHandler');

    console.log(message);
  } catch (error) {
    if (verbose) {
      console.log(error);
    }

    if (debug) {
      throw error;
    }
  }

}

function clearCache() {

  var engineListing = fs.readdirSync(__dirname + '/engine');

  for (var i = 0; i < engineListing.length; i++) {

    var module = require.resolve('./engine/' + engineListing[i]);
    delete require.cache[module];
  }

  var formListing = fs.readdirSync(__dirname + '/form');

  for (i = 0; i < formListing.length; i++) {

    delete require.cache[require.resolve('./form/' + formListing[i])];
  }

  var apiListing = fs.readdirSync(__dirname + '/api');

  for (i = 0; i < apiListing.length; i++) {

    delete require.cache[require.resolve('./api/' + apiListing[i])];
  }

}

exports.boot = function() {
  require('./db').init(function dbBooted(error) {

    if (error) {
      console.log(error);
    } else {
      startListening();
    }

  });

};