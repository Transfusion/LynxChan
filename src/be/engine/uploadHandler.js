'use strict';

// handles any action regarding user uploads
var fs = require('fs');
var im = require('gm').subClass({
  imageMagick : true
});
var gsHandler = require('./gridFsHandler');
var db = require('../db');
var hashBans = db.hashBans();
var threads = db.threads();
var boards = db.boards();
var lang = require('./langOps').languagePack();
var exec = require('child_process').exec;
var boot = require('../boot');
var miscOps = require('../engine/miscOps');
var genericThumb = boot.genericThumb();
var genericAudioThumb = boot.genericAudioThumb();
var spoilerPath = boot.spoilerImage();
var posts = db.posts();
var settings = boot.getGeneralSettings();
var videoDimensionsCommand = 'ffprobe -v error -show_entries ';
videoDimensionsCommand += 'stream=width,height ';
var videoThumbCommand = 'ffmpeg -i {$path} -y -vframes 1 -vf scale=';
var mp3ThumbCommand = 'ffmpeg -i {$path} -y -an -vcodec copy {$destination}';
mp3ThumbCommand += ' && mogrify -resize {$dimension} {$destination}';
var archive = settings.archiveLevel > 1;
var supportedMimes = settings.acceptedMimes;
var thumbSize = settings.thumbSize;

var correctedMimesRelation = {
  'video/webm' : 'audio/webm',
  'video/ogg' : 'audio/ogg'
};

var thumbAudioMimes = [ 'audio/mpeg', 'audio/ogg' ];

var videoMimes = [ 'video/webm', 'video/mp4', 'video/ogg' ];

exports.videoMimes = function() {
  return videoMimes;
};

exports.supportedMimes = function() {
  return supportedMimes;
};

exports.getImageBounds = function(path, callback) {

  im(path).identify(function(error, stats) {

    if (!error) {
      callback(null, stats.size.width, stats.size.height);
    } else {
      callback(error);
    }

  });

};

exports.getGifBounds = function(path, callback) {

  exec('identify ' + path, function(error, results) {
    if (error) {
      callback(error);
    } else {
      var lines = results.split('\n');

      var maxHeight = 0;
      var maxWidth = 0;

      for (var i = 0; i < lines.length; i++) {
        var dimensions = lines[i].match(/\s(\d+)x(\d+)\s/);

        if (dimensions) {

          maxWidth = dimensions[1] > maxWidth ? dimensions[1] : maxWidth;
          maxHeight = dimensions[2] > maxHeight ? dimensions[2] : maxHeight;

        }
      }

      callback(null, maxWidth, maxHeight);
    }
  });

};

// side-effect: might change the file mime.
exports.getVideoBounds = function(file, callback) {

  var path = file.pathInDisk;

  exec(videoDimensionsCommand + path, function gotDimensions(error, output) {

    if (error) {
      callback(error);
    } else {

      var matches = output.match(/width\=(\d+)\nheight\=(\d+)/);

      if (!matches) {
        var correctedMime = correctedMimesRelation[file.mime];

        if (!correctedMime) {
          callback('Unable to get dimensions for file.');
        } else {
          file.mime = correctedMime;
          callback(null, null, null);
        }
      } else {
        callback(null, +matches[1], +matches[2]);
      }

    }
  });

};

exports.removeFromDisk = function(path, callback) {
  fs.unlink(path, function removedFile(error) {
    if (callback) {
      callback(error);
    }
  });
};

// start of upload saving process
function updatePostingFiles(boardData, threadId, postId, file, callback,
    updatedFileCount) {

  // updates thread's file count before proceeding
  if (postId && !updatedFileCount) {
    threads.updateOne({
      threadId : threadId,
      boardUri : boardData.boardUri
    }, {
      $inc : {
        fileCount : 1
      }
    }, function updatedFileCount(error) {
      if (error) {
        callback(error);
      } else {
        updatePostingFiles(boardData, threadId, postId, file, callback, true);
      }
    });

    return;
  }

  var queryBlock = {
    boardUri : boardData.boardUri,
    threadId : threadId
  };

  var collectionToQuery = threads;

  if (postId) {
    queryBlock.postId = postId;
    collectionToQuery = posts;
  }

  collectionToQuery.update(queryBlock, {
    $push : {
      files : {
        originalName : file.title.replace(/[<>]/g, function replace(match) {
          return miscOps.htmlReplaceTable[match];
        }),
        path : file.path,
        mime : file.mime,
        thumb : file.thumbPath,
        name : file.gfsName,
        size : file.size,
        md5 : file.md5,
        width : file.width,
        height : file.height
      }
    }
  }, callback);

}

function cleanThumbNail(boardData, threadId, postId, file, saveError, cb) {

  if (file.thumbOnDisk) {

    exports.removeFromDisk(file.thumbOnDisk, function removed(deletionError) {
      if (saveError || deletionError) {
        cb(saveError || deletionError);
      } else {
        updatePostingFiles(boardData, threadId, postId, file, cb);
      }

    });
  } else {

    if (saveError) {
      cb(saveError);
    } else {
      updatePostingFiles(boardData, threadId, postId, file, cb);
    }
  }
}

function transferMediaToGfs(boardData, threadId, postId, fileId, file,
    extension, meta, cb) {

  var fileName = fileId + '.' + extension;
  fileName = '/' + boardData.boardUri + '/media/' + fileName;

  file.path = fileName;
  file.gfsName = fileId + '.' + extension;

  var allowsArchive;

  if (boardData.settings) {
    allowsArchive = boardData.settings.indexOf('archive') > -1;
  }

  var archiveMedia = allowsArchive && archive;

  gsHandler.writeFile(file.pathInDisk, fileName, file.mime, meta, cb,
      archiveMedia);

}

function processThumb(boardData, threadId, postId, fileId, ext, file, meta,
    callback) {
  var thumbName = '/' + boardData.boardUri + '/media/' + 't_' + fileId;
  thumbName += '.' + (settings.thumbExtension || ext);

  file.thumbPath = thumbName;

  var allowsArchive;

  if (boardData.settings) {
    allowsArchive = boardData.settings.indexOf('archive') > -1;
  }

  gsHandler.writeFile(file.thumbOnDisk, thumbName, file.thumbMime, meta,
      function wroteTbToGfs(error) {
        if (error) {
          callback(error);
        } else {
          transferMediaToGfs(boardData, threadId, postId, fileId, file, ext,
              meta, callback);
        }

      }, archive && allowsArchive);
}

function transferThumbToGfs(boardData, threadId, postId, fileId, file, cb) {

  var parts = file.title.split('.');

  var meta = {
    boardUri : boardData.boardUri,
    threadId : threadId,
    type : 'media'
  };

  if (postId) {
    meta.postId = postId;
  }

  if (parts.length > 1) {

    var ext = parts[parts.length - 1].toLowerCase().replace(/\W/g, '');

    if (file.thumbOnDisk) {

      processThumb(boardData, threadId, postId, fileId, ext, file, meta, cb);

    } else {
      transferMediaToGfs(boardData, threadId, postId, fileId, file, ext, meta,
          cb);
    }

  } else {
    cb(lang.errUnknownExtension);
  }

}

function saveUpload(boardData, threadId, postId, file, callback) {

  boards.findOneAndUpdate({
    boardUri : boardData.boardUri
  }, {
    $inc : {
      lastFileId : 1
    }
  }, {
    returnOriginal : false
  }, function incrementedFileId(error, result) {
    if (error) {
      callback(error);
    } else {
      transferThumbToGfs(boardData, threadId, postId, result.value.lastFileId,
          file, callback);
    }
  });

}

function transferFilesToGS(boardData, threadId, postId, file, callback) {

  saveUpload(boardData, threadId, postId, file, function transferedFile(error) {

    cleanThumbNail(boardData, threadId, postId, file, error, callback);
  });
}

function checkForHashBan(boardUri, md5, callback) {

  hashBans.count({
    md5 : md5,
    $or : [ {
      boardUri : {
        $exists : false
      }
    }, {
      boardUri : boardUri
    } ]
  }, callback);

}

function generateVideoThumb(boardData, threadId, postId, file, tooSmall,
    callback) {

  var command = videoThumbCommand.replace('{$path}', file.pathInDisk);

  var extensionToUse = settings.thumbExtension || 'png';

  var thumbDestination = file.pathInDisk + '_.' + extensionToUse;

  if (tooSmall) {
    command += '-1:-1';
  } else if (file.width > file.height) {
    command += thumbSize + ':-1';
  } else {
    command += '-1:' + thumbSize;
  }

  command += ' ' + thumbDestination;

  file.thumbMime = miscOps.getMime(thumbDestination);
  file.thumbOnDisk = thumbDestination;

  exec(command, function createdThumb(error) {
    if (error) {
      callback(error);
    } else {
      transferFilesToGS(boardData, threadId, postId, file, callback);
    }
  });

}

function generateAudioThumb(boardData, threadId, postId, file, callback) {

  var extensionToUse = settings.thumbExtension || 'png';

  var thumbDestination = file.pathInDisk + '_.' + extensionToUse;

  var mp3Command = mp3ThumbCommand.replace('{$path}', file.pathInDisk).replace(
      /\{\$destination\}/g, thumbDestination).replace('{$dimension}',
      thumbSize + 'x' + thumbSize);

  exec(mp3Command, function createdThumb(error) {

    if (error) {
      file.thumbPath = genericAudioThumb;
    } else {
      file.thumbOnDisk = thumbDestination;
      file.thumbMime = miscOps.getMime(thumbDestination);
    }

    transferFilesToGS(boardData, threadId, postId, file, callback);
  });

}

function generateGifThumb(boardData, threadId, postId, file, callback) {

  var thumbDestination = file.pathInDisk + '_t';

  if (settings.thumbExtension) {
    thumbDestination += '.' + settings.thumbExtension;
  }

  file.thumbOnDisk = thumbDestination;
  file.thumbMime = file.mime;

  var command = 'convert \'' + file.pathInDisk + '[0]\' -coalesce -resize ';
  command += thumbSize + 'x' + thumbSize + ' ' + thumbDestination;

  exec(command, function resized(error) {
    if (error) {
      callback(error);
    } else {
      transferFilesToGS(boardData, threadId, postId, file, callback);

    }
  });
}

function generateImageThumb(boardData, threadId, postId, file, callback) {

  var thumbDestination = file.pathInDisk + '_t';

  if (settings.thumbExtension) {
    thumbDestination += '.' + settings.thumbExtension;
  }

  file.thumbOnDisk = thumbDestination;
  file.thumbMime = file.mime;

  im(file.pathInDisk).resize(thumbSize, thumbSize).noProfile().write(
      thumbDestination, function(error) {
        if (error) {
          callback(error);
        } else {
          transferFilesToGS(boardData, threadId, postId, file, callback);

        }
      });

}

function processSpoilerThumb(boardData, threadId, postId, file, callback) {

  var spoilerToUse;

  if (boardData.usesCustomSpoiler) {
    spoilerToUse = '/' + boardData.boardUri + '/custom.spoiler';
  } else {
    spoilerToUse = spoilerPath;
  }

  file.thumbPath = spoilerToUse;

  transferFilesToGS(boardData, threadId, postId, file, callback);
}

function processFile(boardData, threadId, postId, file, parameters, callback) {

  var tooSmall = file.height <= thumbSize && file.width <= thumbSize;

  var gifCondition = settings.thumbExtension || tooSmall;

  if (parameters.spoiler) {

    processSpoilerThumb(boardData, threadId, postId, file, callback);
  } else if (file.mime === 'image/gif' && gifCondition) {

    generateGifThumb(boardData, threadId, postId, file, callback);

  } else if (file.mime.indexOf('image/') !== -1 && !tooSmall) {

    generateImageThumb(boardData, threadId, postId, file, callback);

  } else if (videoMimes.indexOf(file.mime) > -1 && settings.mediaThumb) {

    generateVideoThumb(boardData, threadId, postId, file, tooSmall, callback);

  } else if (thumbAudioMimes.indexOf(file.mime) > -1 && settings.mediaThumb) {

    generateAudioThumb(boardData, threadId, postId, file, callback);
  } else {

    if (thumbAudioMimes.indexOf(file.mime) > -1) {
      file.thumbPath = genericAudioThumb;
    } else {
      file.thumbPath = genericThumb;
    }

    transferFilesToGS(boardData, threadId, postId, file, callback);
  }
}

exports.saveUploads = function(boardData, threadId, postId, parameters,
    callback, index) {

  index = index || 0;

  if (index < parameters.files.length) {

    var file = parameters.files[index];

    checkForHashBan(boardData.boardUri, file.md5, function isBanned(error,
        banned) {
      if (error) {
        callback(error);
      } else if (banned) {
        exports.saveUploads(boardData, threadId, postId, parameters, callback,
            index + 1);
      } else {

        // style exception, too simple
        processFile(boardData, threadId, postId, file, parameters,
            function processedFile(error) {
              if (error) {
                callback(error);
              } else {
                exports.saveUploads(boardData, threadId, postId, parameters,
                    callback, index + 1);
              }
            });
        // style exception, too simple

      }
    });

  } else {
    callback();
  }
};
// end of upload saving process
