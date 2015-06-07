'use strict';

var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var settings = require('../boot').getGeneralSettings();
var verbose = settings.verbose;
var logger = require('../logger');
var exec = require('child_process').exec;
var im = require('gm').subClass({
  imageMagick : true
});
var captchas = require('../db').captchas();
var crypto = require('crypto');
var settings = require('../boot').getGeneralSettings();
var captchaExpiration = settings.captchaExpiration || 1;
var uploadHandler = require('./uploadHandler');
var formOps = require('./formOps');
var gridFsHandler = require('./gridFsHandler');
var tempDirectory = settings.tempDirectory || '/tmp';

// captcha settings
var fonts = settings.captchaFonts || [];
var bgColor = '#ffffff';
var fontSize = 70;

// color range so they are not too clear in the white background
var minColor = 125;
var maxColor = 175;

var height = 100;
var width = 300;

// used so lines will always run across the captcha
var minLineX = width / 4;
var maxLineX = width - minLineX;

// used to distortion doesn't pull point too hard
var distortLimiter = 30;

// used to control how many points are pulled
var minDistorts = 3;
var maxDistorts = 5;

var minLines = 1;
var maxLines = 3;
var lineWidth = 2;
var noise = 'multiplicative';

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getRandomColor() {
  var red = getRandomInt(minColor, maxColor).toString(16);
  var green = getRandomInt(minColor, maxColor).toString(16);
  var blue = getRandomInt(minColor, maxColor).toString(16);

  if (red.length === 1) {
    red = '0' + red;
  }

  if (green.length === 1) {
    green = '0' + green;
  }

  if (blue.length === 1) {
    blue = '0' + blue;
  }

  return '#' + red + green + blue;

}

// start of generation
function addLines(path, id, callback) {

  var image = im(path).stroke(getRandomColor(), lineWidth);

  for (var i = 0; i < getRandomInt(minLines, maxLines); i++) {

    image.drawLine(getRandomInt(0, minLineX), getRandomInt(0, height),
        getRandomInt(maxLineX, width), getRandomInt(0, height));

  }

  image.write(path, function wrote(error) {

    if (error) {
      callback(error);
    } else {

      // style exception, too simple
      gridFsHandler.writeFile(path, id + '.png', 'image/png', {
        type : 'captcha',
        expiration : logger.addMinutes(new Date(), captchaExpiration)
      }, function wroteToGfs(error) {
        callback(error);

      });
      // style exception, too simple
    }

  });

}

function distortImage(path, id, distorts, callback) {

  var command = 'mogrify -distort Shepards \'';

  for (var i = 0; i < distorts.length; i++) {

    var distort = distorts[i];

    if (i) {
      command += '  ';
    }

    command += distort.origin.x + ',' + distort.origin.y + ' ';
    command += distort.destiny.x + ',' + distort.destiny.y;

  }

  command += '\' ' + path;

  exec(command, function distorted(error) {

    if (error) {
      callback(error);
    } else {
      addLines(path, id, callback);
    }

  });

}

function getBaseDistorts() {
  var distorts = [];

  distorts.push({
    origin : {
      x : 0,
      y : 0
    },
    destiny : {
      x : 0,
      y : 0
    }
  });

  distorts.push({
    origin : {
      x : 0,
      y : height
    },
    destiny : {
      x : 0,
      y : height
    }
  });

  distorts.push({
    origin : {
      x : width,
      y : 0
    },
    destiny : {
      x : width,
      y : 0
    }
  });

  distorts.push({
    origin : {
      x : width,
      y : height
    },
    destiny : {
      x : width,
      y : height
    }
  });

  return distorts;
}

function getDistorts() {

  var distorts = getBaseDistorts(width, height);

  var amountOfDistorts = getRandomInt(minDistorts, maxDistorts);
  var portionSize = width / amountOfDistorts;

  for (var i = 0; i < amountOfDistorts; i++) {
    var distortOrigin = {
      x : getRandomInt(portionSize * i, portionSize * (1 + i)),
      y : getRandomInt(0, height)
    };

    var minWidthDestiny = distortOrigin.x - distortLimiter;
    var minHeightDestiny = distortOrigin.y - distortLimiter;

    var distortDestination = {
      x : getRandomInt(minWidthDestiny, distortOrigin.x + distortLimiter),
      y : getRandomInt(minHeightDestiny, distortOrigin.y + distortLimiter)
    };

    var distort = {
      origin : distortOrigin,
      destiny : distortDestination
    };

    distorts.push(distort);
  }

  return distorts;

}

function generateImage(text, id, callback) {

  var path = tempDirectory + '/' + id + '.png';

  var image = im(width, height, bgColor).fill(getRandomColor());

  if (fonts.length) {
    var font = fonts[getRandomInt(0, fonts.length - 1)];
    image.font(font);

  }

  image.fontSize(fontSize).drawText(0, 0, text, 'center');

  if (noise) {
    image.noise(noise);
  }

  image.write(path, function wrote(error) {
    if (error) {
      callback(error);
    } else {

      // style exception, too simple
      distortImage(path, id, getDistorts(width, height),
          function distoredImage(error) {

            uploadHandler.removeFromDisk(path);

            callback(error, id);

          });
      // style exception, too simple

    }
  });

}

exports.generateCaptcha = function(callback) {

  var text = crypto.createHash('sha256').update(Math.random() + new Date())
      .digest('hex').substring(0, 6);

  var toInsert = {
    answer : text,
    expiration : logger.addMinutes(new Date(), captchaExpiration)
  };

  captchas.insert(toInsert, function(error) {

    if (error) {
      callback(error);
    } else {
      generateImage(text, toInsert._id, callback);
    }
  });

};
// end of generation

exports.checkForCaptcha = function(req, callback) {

  var cookies = formOps.getCookies(req);

  captchas.findOne({
    _id : new ObjectID(cookies.captchaId),
    expiration : {
      $gt : new Date()
    }
  }, function foundCaptcha(error, captcha) {
    callback(error, captcha ? captcha._id : null);
  });

};

exports.attemptCaptcha = function(id, input, callback) {

  if (verbose) {
    console.log('Attempting to solve captcha ' + id + ' with answer ' + input);
  }

  captchas.findOneAndDelete({
    _id : new ObjectID(id),
    expiration : {
      $gt : new Date()
    }
  }, function gotCaptcha(error, captcha) {

    if (error) {
      callback(error);
    } else if (captcha.value && captcha.value.answer === input) {
      callback();
    } else if (!captcha.value) {
      callback('Expired captcha.');
    } else {
      callback('Incorrect captcha');
    }

  });

};
