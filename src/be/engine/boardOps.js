'use strict';

// handles board operations

var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var db = require('../db');
var flags = db.flags();
var miscOps = require('./miscOps');
var gridFsHandler = require('./gridFsHandler');
var logger = require('../logger');
var files = db.files();
var reports = db.reports();
var lang = require('./langOps').languagePack();
var users = db.users();
var boards = db.boards();
var logs = db.logs();
var boot = require('../boot');
var settings = boot.getGeneralSettings();
var restrictedBoardCreation = settings.restrictBoardCreation;
var validSettings = [ 'disableIds', 'disableCaptcha', 'forceAnonymity',
    'allowCode' ];
var maxRulesCount = settings.maxBoardRules || 20;
var maxFiltersCount = settings.maxFilters || 20;
var maxVolunteers = settings.maxBoardVolunteers || 20;
var replaceTable = {
  '<' : '&lt;',
  '>' : '&gt;'
};

var maxBannerSize = boot.maxBannerSize();
var maxFlagSize = boot.maxFlagSize();

var boardParameters = [ {
  field : 'boardUri',
  length : 32
}, {
  field : 'boardName',
  length : 32,
  removeHTML : true
}, {
  field : 'anonymousName',
  length : 32,
  removeHTML : true
}, {
  field : 'boardDescription',
  length : 128,
  removeHTML : true
} ];

var filterParameters = [ {
  field : 'originalTerm',
  length : 32
}, {
  field : 'replacementTerm',
  length : 32,
  removeHTML : true
} ];

var newFlagParameters = [ {
  field : 'flagName',
  length : 16,
  removeHTML : true
} ];

exports.getValidSettings = function() {
  return validSettings;
};

function checkBoardRebuild(board, params) {

  var nameChanged = board.boardName !== params.boardName;

  var descriptionChanged = board.boardDescription !== params.boardDescription;

  var oldSettings = board.settings;
  var newSettings = params.settings;

  var hadCaptcha = oldSettings.indexOf('disableCaptcha') === -1;
  var hasCaptcha = newSettings.indexOf('disableCaptcha') === -1;

  var captchaChanged = hadCaptcha !== hasCaptcha;

  var hadAnon = oldSettings.indexOf('forceAnonymity') === -1;
  var hasAnon = newSettings.indexOf('forceAnonymity') === -1;

  var anonChanged = hadAnon !== hasAnon;

  if (nameChanged || descriptionChanged || captchaChanged || anonChanged) {

    process.send({
      board : params.boardUri,
      buildAll : true
    });

  }

  if (nameChanged) {
    process.send({
      frontPage : true
    });
  }

}

function saveNewSettings(board, parameters, callback) {

  boards.updateOne({
    boardUri : parameters.boardUri
  }, {
    $set : {
      boardName : parameters.boardName,
      boardDescription : parameters.boardDescription,
      settings : parameters.settings,
      anonymousName : parameters.anonymousName
    }
  }, function updatedBoard(error) {

    checkBoardRebuild(board, parameters);

    callback(error);

  });

}

exports.setSettings = function(userData, parameters, callback) {

  boards.findOne({
    boardUri : parameters.boardUri
  }, function(error, board) {

    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userData.login) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {
      miscOps.sanitizeStrings(parameters, boardParameters);

      saveNewSettings(board, parameters, callback);

    }

  });

};

function updateUsersOwnedBoards(oldOwner, parameters, callback) {

  users.update({
    login : oldOwner
  }, {
    $pull : {
      ownedBoards : parameters.boardUri
    }
  }, function removedFromPreviousOwner(error) {
    if (error) {
      callback(error);

    } else {

      // style exception, too simple
      users.update({
        login : parameters.login
      }, {
        $addToSet : {
          ownedBoards : parameters.boardUri
        }
      }, function addedToNewOwner(error) {
        callback(error);
      });
      // style exception, too simple

    }
  });

}

function performTransfer(oldOwner, userData, parameters, callback) {

  var message = lang.logTransferBoard.replace('{$actor}', userData.login)
      .replace('{$board}', parameters.boardUri).replace('{$login}',
          parameters.login);

  logs.insert({
    user : userData.login,
    time : new Date(),
    global : true,
    boardUri : parameters.boardUri,
    type : 'boardTransfer',
    description : message
  }, function createdLog(error) {
    if (error) {
      logger.printLogError(message, error);
    }

    // style exception, too simple
    boards.update({
      boardUri : parameters.boardUri
    }, {
      $set : {
        owner : parameters.login
      },
      $pull : {
        volunteers : parameters.login
      }
    }, function transferedBoard(error) {
      if (error) {
        callback(error);
      } else {
        updateUsersOwnedBoards(oldOwner, parameters, callback);
      }

    });
    // style exception, too simple
  });

}

exports.transfer = function(userData, parameters, callback) {

  var admin = userData.globalRole < 2;

  boards.findOne({
    boardUri : parameters.boardUri
  }, {
    _id : 0,
    owner : 1
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (userData.login !== board.owner && !admin) {
      callback(lang.errDeniedBoardTransfer);
    } else if (board.owner === parameters.login) {
      callback();
    } else {

      // style exception, too simple
      users.count({
        login : parameters.login
      }, function gotCount(error, count) {
        if (error) {
          callback(error);
        } else if (!count) {
          callback(lang.errUserNotFound);
        } else {
          performTransfer(board.owner, userData, parameters, callback);
        }
      });
      // style exception, too simple

    }

  });

};

function manageVolunteer(currentVolunteers, parameters, callback) {

  var isAVolunteer = currentVolunteers.indexOf(parameters.login) > -1;

  if (parameters.add === isAVolunteer) {
    callback();
  } else if (!isAVolunteer && currentVolunteers.length >= maxVolunteers) {
    callback(lang.errMaxBoardVolunteers);
  } else {

    var operation;

    if (isAVolunteer) {
      operation = {
        $pull : {
          volunteers : parameters.login
        }
      };
    } else {
      operation = {
        $addToSet : {
          volunteers : parameters.login
        }
      };
    }

    users.count({
      login : parameters.login
    }, function gotCount(error, count) {
      if (error) {
        callback(error);
      } else if (!count && !isAVolunteer) {
        callback(lang.errUserNotFound);
      } else {
        // style exception, too simple
        boards.update({
          boardUri : parameters.boardUri
        }, operation, function updatedVolunteers(error) {
          callback(error);
        });
        // style exception, too simple
      }
    });

  }

}

exports.setVolunteer = function(userData, parameters, callback) {

  if (userData.login === parameters.login) {
    callback(lang.errSelfVolunteer);
    return;
  }

  boards.findOne({
    boardUri : parameters.boardUri
  }, {
    _id : 0,
    owner : 1,
    volunteers : 1
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userData.login) {
      callback(lang.errDeniedSetVolunteer);
    } else {
      manageVolunteer(board.volunteers || [], parameters, callback);
    }
  });

};

function isAllowedToManageBoard(login, boardData) {

  var owner = login === boardData.owner;

  var volunteer;

  if (boardData.volunteers) {
    volunteer = boardData.volunteers.indexOf(login) > -1;
  }

  return owner || volunteer;

}

function getBoardReports(boardData, callback) {

  reports.find({
    boardUri : boardData.boardUri,
    closedBy : {
      $exists : false
    },
    global : false
  }).sort({
    creation : -1
  }).toArray(function(error, reports) {

    callback(error, boardData, reports);

  });

}

exports.getBoardManagementData = function(login, board, callback) {

  boards.findOne({
    boardUri : board
  }, {
    _id : 0,
    owner : 1,
    boardUri : 1,
    boardName : 1,
    anonymousName : 1,
    settings : 1,
    boardDescription : 1,
    volunteers : 1
  }, function(error, boardData) {
    if (error) {
      callback(error);
    } else if (!boardData) {
      callback(lang.errBoardNotFound);
    } else if (isAllowedToManageBoard(login, boardData)) {
      getBoardReports(boardData, callback);
    } else {
      callback(lang.errDeniedManageBoard);
    }
  });

};

exports.createBoard = function(parameters, userData, callback) {

  var role = userData.globalRole || 4;

  if (role > 1 && restrictedBoardCreation) {
    callback(lang.errDeniedBoardCreation);
    return;
  }

  miscOps.sanitizeStrings(parameters, boardParameters);

  if (/\W/.test(parameters.boardUri)) {
    callback(lang.errInvalidUri);
    return;
  }

  boards.insert({
    boardUri : parameters.boardUri,
    boardName : parameters.boardName,
    boardDescription : parameters.boardDescription,
    owner : userData.login,
    settings : []
  }, function insertedBoard(error) {
    if (error && error.code !== 11000) {
      callback(error);
    } else if (error) {
      callback(lang.errUriInUse);
    } else {

      // style exception, too simple

      users.update({
        login : userData.login
      }, {
        $addToSet : {
          ownedBoards : parameters.boardUri
        }
      }, function updatedUser(error) {
        // signal rebuild of board pages
        process.send({
          board : parameters.boardUri,
          buildAll : true
        });

        callback(error);
      });

      // style exception, too simple

    }
  });

};

exports.getBannerData = function(user, boardUri, callback) {

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== user) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {

      // style exception, too simple
      files.find({
        'metadata.boardUri' : boardUri,
        'metadata.type' : 'banner'
      }).sort({
        uploadDate : 1
      }).toArray(function(error, banners) {
        callback(error, banners);
      });
      // style exception, too simple
    }
  });

};

exports.addBanner = function(user, parameters, callback) {

  if (!parameters.files.length) {
    callback(lang.errNoFiles);
    return;
  } else if (parameters.files[0].mime.indexOf('image/') === -1) {
    callback(lang.errNotAnImage);
    return;
  } else if (parameters.files[0].size > maxBannerSize) {
    callback(lang.errBannerTooLarge);
  }

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== user) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {
      var bannerPath = '/' + parameters.boardUri + '/banners/';
      bannerPath += new Date().getTime();

      var file = parameters.files[0];

      gridFsHandler.writeFile(file.pathInDisk, bannerPath, file.mime, {
        boardUri : parameters.boardUri,
        status : 200,
        type : 'banner'
      }, callback);
    }
  });

};
// start of banner deletion

function removeBanner(banner, callback) {
  gridFsHandler.removeFiles(banner.filename, function removedFile(error) {
    callback(error, banner.metadata.boardUri);
  });

}

exports.deleteBanner = function(login, parameters, callback) {

  try {

    files.findOne({
      _id : new ObjectID(parameters.bannerId)
    }, function gotBanner(error, banner) {
      if (error) {
        callback(error);
      } else if (!banner) {
        callback(lang.errBannerNotFound);
      } else {
        // style exception, too simple

        boards.findOne({
          boardUri : banner.metadata.boardUri
        }, function gotBoard(error, board) {
          if (error) {
            callback(error);
          } else if (!board) {
            callback(lang.errBoardNotFound);
          } else if (board.owner !== login) {
            callback(lang.errDeniedChangeBoardSettings);
          } else {
            removeBanner(banner, callback);
          }
        });
        // style exception, too simple

      }

    });
  } catch (error) {
    callback(error);
  }
};
// end of banner deletion

exports.getFilterData = function(user, boardUri, callback) {

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (user !== board.owner) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {
      callback(null, board.filters || []);
    }
  });

};

// start of filter creation
function setFilter(board, callback, parameters) {
  var existingFilters = board.filters || [];

  var found = false;

  for (var i = 0; i < existingFilters.length; i++) {
    var filter = existingFilters[i];

    if (filter.originalTerm === parameters.originalTerm) {
      found = true;

      filter.replacementTerm = parameters.replacementTerm;

      break;
    }
  }

  if (!found) {

    existingFilters.push({
      originalTerm : parameters.originalTerm,
      replacementTerm : parameters.replacementTerm
    });

  }

  boards.updateOne({
    boardUri : parameters.boardUri
  }, {
    $set : {
      filters : existingFilters
    }
  }, function updatedFilters(error) {
    callback(error);
  });

}

exports.createFilter = function(user, parameters, callback) {

  miscOps.sanitizeStrings(parameters, filterParameters);

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== user) {
      callback(lang.errDeniedChangeBoardSettings);
    } else if (board.filters && board.filters.length >= maxFiltersCount) {
      callback(lang.errMaxFiltersReached);
    } else {
      setFilter(board, callback, parameters);
    }
  });

};
// end of filter creation

exports.deleteFilter = function(login, parameters, callback) {

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== login) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {

      var existingFilters = board.filters || [];

      for (var i = 0; i < existingFilters.length; i++) {
        var filter = existingFilters[i];
        if (filter.originalTerm === parameters.filterIdentifier) {

          existingFilters.splice(i, 1);

          break;
        }

      }

      // style exception, too simple

      boards.updateOne({
        boardUri : parameters.boardUri
      }, {
        $set : {
          filters : existingFilters
        }
      }, function updatedFilters(error) {
        callback(error);
      });

      // style exception, too simple

    }
  });

};

exports.getBoardModerationData = function(userData, boardUri, callback) {

  var admin = userData.globalRole < 2;

  if (!admin) {
    callback(lang.errDeniedBoardMod);
    return;
  }

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else {

      // style exception, too simple
      users.findOne({
        login : board.owner
      }, function gotOwner(error, user) {
        callback(error, board, user);
      });
      // style exception, too simple
    }
  });
};

// start of custom css upload
function updateBoardAfterNewCss(board, callback) {

  if (!boards.usesCustomCss) {
    boards.updateOne({
      boardUri : board.boardUri
    }, {
      $set : {
        usesCustomCss : true
      }
    }, function updatedBoard(error) {
      if (error) {
        callback(error);
      } else {
        process.send({
          board : board.boardUri,
          buildAll : true
        });

        callback();
      }

    });
  } else {
    callback();
  }

}

exports.setCustomCss = function(userData, boardUri, file, callback) {

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userData.login) {
      callback(lang.errDeniedCssManagement);
    } else if (file.mime !== 'text/css') {
      callback(lang.errOnlyCssAllowed);
    } else {

      // style exception, too simple
      gridFsHandler.writeFile(file.pathInDisk, '/' + boardUri + '/custom.css',
          file.mime, {
            boardUri : boardUri
          }, function savedFile(error) {
            if (error) {
              callback(error);
            } else {
              updateBoardAfterNewCss(board, callback);
            }
          });
      // style exception, too simple

    }
  });

};
// end of custom css upload

// start of css deletion
function updateBoardAfterDeleteCss(board, callback) {

  if (board.usesCustomCss) {
    boards.updateOne({
      boardUri : board.boardUri
    }, {
      $set : {
        usesCustomCss : false
      }
    }, function updatedBoard(error) {
      if (error) {
        callback(error);
      } else {
        process.send({
          board : board.boardUri,
          buildAll : true
        });
        callback();
      }

    });
  } else {
    callback();
  }

}

exports.deleteCustomCss = function(userData, boardUri, callback) {

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userData.login) {
      callback(lang.errDeniedCssManagement);
    } else {

      // style exception, too simple
      gridFsHandler.removeFiles('/' + boardUri + '/custom.css',
          function removedFile(error) {
            if (error) {
              callback(error);
            } else {
              updateBoardAfterDeleteCss(board, callback);
            }
          });
      // style exception, too simple

    }
  });

};
// start of css deletion

exports.boardRules = function(boardUri, userData, callback) {

  boards.findOne({
    boardUri : boardUri
  }, {
    rules : 1,
    owner : 1,
    _id : 0
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (userData && userData.login !== board.owner) {
      callback(lang.errDeniedRuleManagement);
    } else {
      callback(null, board.rules || []);
    }
  });
};

exports.addBoardRule = function(parameters, userData, callback) {

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (userData.login !== board.owner) {
      callback(!lang.errDeniedRuleManagement);
    } else {
      if (board.rules && board.rules.length >= maxRulesCount) {
        callback(lang.errRuleLimitReached);

        return;
      }

      var rule = parameters.rule.substring(0, 512).replace(/[<>]/g,
          function replace(match) {
            return replaceTable[match];
          });

      // style exception, too simple
      boards.updateOne({
        boardUri : parameters.boardUri
      }, {
        $push : {
          rules : rule
        }
      }, function updatedRules(error) {
        if (error) {
          callback(error);
        } else {
          process.send({
            board : board.boardUri,
            rules : true
          });
          callback();
        }
      });
      // style exception, too simple

    }
  });
};

exports.deleteRule = function(parameters, userData, callback) {

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errNoBoardFound);
    } else if (board.owner !== userData.login) {
      callback(lang.errDeniedRuleManagement);
    } else {

      if (isNaN(parameters.ruleIndex)) {
        callback(lang.errInvalidIndex);
        return;
      }

      var index = +parameters.ruleIndex;

      if (!board.rules || board.rules.length <= index) {
        callback();
        return;
      }

      board.rules.splice(index, 1);

      // style exception, too simple
      boards.updateOne({
        boardUri : parameters.boardUri
      }, {
        $set : {
          rules : board.rules
        }
      }, function updatedRules(error) {
        if (error) {
          callback(error);
        } else {
          process.send({
            board : board.boardUri,
            rules : true
          });
          callback();
        }
      });
      // style exception, too simple
    }
  });
};

exports.getFlagsData = function(userLogin, boardUri, callback) {

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userLogin) {
      callback(lang.deniedFlagManagement);
    } else {

      flags.find({
        boardUri : boardUri
      }, {
        name : 1
      }).sort({
        name : 1
      }).toArray(callback);

    }
  });

};

// start of flag creation
function processFlagFile(toInsert, file, callback) {

  var newUrl = '/' + toInsert.boardUri + '/flags/' + toInsert._id;

  gridFsHandler.writeFile(file.pathInDisk, newUrl, file.mime, {
    boardUri : toInsert.boardUri,
    type : 'flag'
  }, function addedFlagFile(error) {
    if (error) {

      // style exception, too simple
      flags.removeOne({
        _id : new ObjectID(toInsert._id)
      }, function removedFlag(deletionError) {
        callback(deletionError || error);
      });
      // style exception, too simple

    } else {
      callback(null, toInsert._id);
    }
  });

}

exports.createFlag = function(userLogin, parameters, callback) {

  if (!parameters.files.length) {
    callback(lang.errNoFiles);
    return;
  } else if (parameters.files[0].mime.indexOf('image/') === -1) {
    callback(lang.errNotAnImage);
    return;
  } else if (parameters.files[0].size > maxFlagSize) {
    callback(lang.errFlagTooLarge);
  }

  miscOps.sanitizeStrings(parameters, newFlagParameters);

  boards.findOne({
    boardUri : parameters.boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userLogin) {
      callback(lang.deniedFlagManagement);
    } else {

      var toInsert = {
        boardUri : parameters.boardUri,
        name : parameters.flagName
      };

      // style exception, too simple
      flags.insertOne(toInsert, function insertedFlag(error) {
        if (error && error.code === 11000) {
          callback(lang.errRepeatedFlag);
        } else if (error) {
          callback(error);
        } else {
          processFlagFile(toInsert, parameters.files[0], callback);
        }
      });
      // style exception, too simple

    }
  });
};
// end of flag creation

// start of flag deletion
function removeFlag(flag, callback) {

  flags.removeOne({
    _id : new ObjectID(flag._id)
  }, function removedFlag(error) {
    if (error) {
      callback(error);
    } else {

      gridFsHandler.removeFiles('/' + flag.boardUri + '/flags/' + flag._id,
          function removedFlagFile(error) {
            callback(error, flag.boardUri);
          });

    }
  });

}

exports.deleteFlag = function(userLogin, flagId, callback) {

  flags.findOne({
    _id : new ObjectID(flagId)
  }, function gotFlag(error, flag) {
    if (error) {
      callback(error);
    } else if (!flag) {
      callback(lang.errFlagNotFound);
    } else {

      // style exception, too simple
      boards.findOne({
        boardUri : flag.boardUri
      }, function gotBoard(error, board) {
        if (error) {
          callback(error);
        } else if (!board) {
          callback(lang.errBoardNotFound);
        } else if (board.owner !== userLogin) {
          callback(lang.deniedFlagManagement);
        } else {
          removeFlag(flag, callback);
        }
      });
      // style exception, too simple

    }
  });

};
// end of flag deletion
