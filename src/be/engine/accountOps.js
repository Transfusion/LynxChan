'use strict';

var db = require('../db');
var users = db.users();
var requests = db.recoveryRequests();
var miscOps = require('./miscOps');
var bcrypt = require('bcrypt');
var domManipulator = require('./domManipulator');
var logger = require('../logger');
var crypto = require('crypto');
var mailer = require('nodemailer').createTransport();
var sender = require('../boot').getGeneralSettings().emailSender;

var newAccountParameters = [ {
  field : 'login',
  length : 16
}, {
  field : 'email',
  length : 64
} ];

exports.registerUser = function(parameters, callback) {

  miscOps.sanitizeStrings(parameters, newAccountParameters);

  if (/\W/.test(parameters.login)) {
    callback('Invalid login');
    return;
  }

  bcrypt.hash(parameters.password, 8, function(error, hash) {
    if (error) {
      callback(error);
    } else {

      var newUser = {
        login : parameters.login,
        password : hash
      };

      // style exception, too simple
      if (parameters.email) {
        newUser.email = parameters.email;
      }
      users.insert(newUser, function createdUser(error) {
        if (error) {
          callback(error);
        } else {
          exports.createSession(parameters.login, callback);
        }
      });

      // style exception, too simple

    }
  });

};

exports.createSession = function(login, callback) {

  var hash = crypto.createHash('sha256').update(
      login + Math.random() + logger.timestamp()).digest('hex');

  users.update({
    login : login
  }, {
    $set : {
      hash : hash
    }
  }, function updatedUser(error) {
    callback(error, hash);
  });

};

exports.login = function(parameters, callback) {

  users.findOne({
    login : parameters.login
  }, {
    _id : 0,
    password : 1
  }, function gotUser(error, user) {
    if (error) {
      callback(error);
    } else if (!user) {
      callback('Login failed');
    } else {

      // style exception, too simple

      bcrypt.compare(parameters.password, user.password, function(error,
          matches) {

        if (error) {
          callback(error);
        } else if (!matches) {
          callback('Login failed');
        } else {
          exports.createSession(parameters.login, callback);
        }
      });

      // style exception, too simple

    }
  });

};

exports.validate = function(auth, callback) {

  users.findOne({
    login : auth.login,
    hash : auth.hash
  }, {
    _id : 0,
    login : 1,
    hash : 1,
    ownedBoards : 1,
    email : 1
  }, function foundUser(error, user) {
    if (error) {
      callback(error);
    } else if (!user) {
      callback('Not found');
    } else {
      callback(null, {
        status : 'ok'
      }, user);
    }
  });
};

function emailUserOfRequest(login, email, hash, callback) {

  var recoveryLink = '/recoverAccount.js?hash=' + hash + '&login=' + login;

  var content = domManipulator.recoveryEmail(recoveryLink);

  mailer.sendMail({
    from : sender,
    to : email,
    subject : 'Password reset request',
    text : content
  }, function emailSent(error) {
    callback(error);
  });

}

function generateRequest(login, email, callback) {

  var requestHash = crypto.createHash('sha256').update(
      login + Math.random() + logger.timestamp()).digest('hex');

  requests.insert({
    login : login,
    recoveryToken : requestHash,
    expiration : logger.addMinutes(new Date(), 24 * 60)
  }, function requestCreated(error) {
    if (error) {
      callback(error);
    } else {

      emailUserOfRequest(login, email, requestHash, callback);

    }

  });

}

function lookForUserEmailOfRequest(login, callback) {

  users.findOne({
    login : login
  }, {
    email : 1,
    _id : 0
  }, function gotUser(error, user) {
    if (error) {
      callback(error);
    } else if (!user) {
      callback('Account not found');
    } else if (!user.email) {
      callback('Account doesn\'t have an email associated to it.');
    } else {
      generateRequest(login, user.email, callback);
    }
  });

}

exports.requestRecovery = function(login, callback) {

  requests.findOne({
    login : login,
    expiration : {
      $gte : new Date()
    }
  }, {
    _id : 0,
    expiration : 1
  }, function gotRequest(error, request) {
    if (error) {
      callback(error);
    } else if (request) {

      var message = 'Pending request to be expired at ';
      message += request.expiration.toString();
      callback(message);
    } else {
      lookForUserEmailOfRequest(login, callback);
    }
  });

};

function emailUserNewPassword(email, newPass, callback) {

  var content = domManipulator.resetEmail(newPass);

  mailer.sendMail({
    from : sender,
    to : email,
    subject : 'Password reseted',
    text : content
  }, function emailSent(error) {
    callback(error);
  });

}

function generateNewPassword(login, callback) {

  var newPass = crypto.createHash('sha256').update(
      login + Math.random() + logger.timestamp()).digest('hex').substring(0, 6);

  bcrypt.hash(newPass, 8, function(error, hash) {

    if (error) {
      callback(error);
    } else {

      // style exception, too simple

      users.findOneAndUpdate({
        login : login
      }, {
        $set : {
          password : hash
        }
      }, {}, function updatedUser(error, user) {
        if (error) {
          callback(error);
        } else {
          emailUserNewPassword(user.value.email, newPass, callback);
        }
      });

      // style exception, too simple

    }

  });

}

exports.recoverAccount = function(parameters, callback) {

  requests.findOneAndDelete({
    login : parameters.login,
    recoveryToken : parameters.hash,
    expiration : {
      $gte : new Date()
    }
  }, {}, function gotRequest(error, request) {
    if (error) {
      callback(error);
    } else if (!request.value) {
      callback('Invalid recovery request.');
    } else {
      generateNewPassword(parameters.login, callback);
    }
  });
};