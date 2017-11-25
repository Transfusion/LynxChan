'use strict';

// handles miscellaneous pages

var logger = require('../../../logger');
var debug = require('../../../kernel').debug();
var overboard;
var sfwOverboard;
var templateHandler;
var lang;
var common;
var miscOps;
var blockBypass;
var boardCreationRequirement;
var messageLength;

exports.optionalStringLogParameters = [ 'user', 'boardUri', 'after', 'before' ];

exports.accountSettingsRelation = {
  alwaysSignRole : 'checkboxAlwaysSign'
};

exports.loadSettings = function() {

  var settings = require('../../../settingsHandler').getGeneralSettings();

  blockBypass = settings.bypassMode;
  messageLength = settings.messageLength;
  overboard = settings.overboard;
  sfwOverboard = settings.sfwOverboard;
  boardCreationRequirement = settings.boardCreationRequirement;

};

exports.loadDependencies = function() {

  templateHandler = require('../../templateHandler').getTemplates;
  lang = require('../../langOps').languagePack;

  common = require('..').common;
  miscOps = require('../../miscOps');

};

exports.error = function(code, message, language) {

  try {

    var document = templateHandler(language, true).errorPage.template.replace(
        '__title__', lang(language).titError);

    document = document.replace('__codeLabel_inner__', code);

    return document.replace('__errorLabel_inner__', message);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');

  }

};

exports.resetEmail = function(password, language) {

  try {

    return templateHandler(language, true).resetEmail.template.replace(
        '__labelNewPass_inner__', password);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }
};

exports.recoveryEmail = function(recoveryLink, language) {

  try {

    return templateHandler(language, true).recoveryEmail.template.replace(
        '__linkRecovery_href__', recoveryLink);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }
};

// Section 1: Account {
exports.getBoardsDiv = function(boardList) {

  var children = '';

  for (var i = 0; boardList && i < boardList.length; i++) {

    var boardUri = common.clean(boardList[i]);

    var href = '/boardManagement.js?boardUri=' + boardUri;
    var link = '<a href="' + href + '">/' + boardUri + '/</a>';
    children += '<div>' + link + '</div>';

  }

  return children;

};

exports.setAccountSettingsCheckbox = function(settings, document) {

  for ( var key in exports.accountSettingsRelation) {

    var field = '__' + exports.accountSettingsRelation[key] + '_checked__';

    if (settings && settings.indexOf(key) > -1) {
      document = document.replace(field, 'true');
    } else {
      document = document.replace('checked="' + field + '"', '');
    }
  }

  return document;

};

exports.setAccountHideableElements = function(userData, document, removable) {

  var globalStaff = userData.globalRole <= miscOps.getMaxStaffRole();

  if (!globalStaff) {
    document = document.replace('__globalManagementLink_location__', '');
  } else {
    document = document.replace('__globalManagementLink_location__',
        removable.globalManagementLink);
  }

  var allowed = userData.globalRole <= boardCreationRequirement;

  if (boardCreationRequirement <= miscOps.getMaxStaffRole() && !allowed) {
    document = document.replace('__boardCreationDiv_location__', '');
  } else {
    document = document.replace('__boardCreationDiv_location__',
        removable.boardCreationDiv);
  }

  return document;

};

exports.account = function(userData, language) {

  try {

    var template = templateHandler(language, true).accountPage;

    var document = template.template.replace('__title__',
        lang(language).titAccount.replace('{$login}', common
            .clean(userData.login)));

    document = document.replace('__labelLogin_inner__', common
        .clean(userData.login));

    document = exports.setAccountHideableElements(userData, document,
        template.removable);

    document = exports.setAccountSettingsCheckbox(userData.settings, document);

    document = document.replace('__emailField_value__', common
        .clean(userData.email || ''));

    document = document.replace('__ownedDiv_children__', exports
        .getBoardsDiv(userData.ownedBoards));

    return document.replace('__volunteeredDiv_children__', exports
        .getBoardsDiv(userData.volunteeredBoards));

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }
};
// } Section 1: Account

exports.logs = function(dates, language) {

  try {

    var document = templateHandler(language, true).logIndexPage.template
        .replace('__title__', lang(language).titLogs);

    var children = '';

    var cellTemplate = templateHandler(language, true).logIndexCell.template;

    for (var i = 0; i < dates.length; i++) {

      var cell = '<div class="logIndexCell">' + cellTemplate;

      var href = '/.global/logs/' + logger.formatedDate(dates[i]) + '.html';
      var displayDate = common.formatDateToDisplay(dates[i], true, language);

      cell = cell.replace('__dateLink_href__', href);

      children += cell.replace('__dateLink_inner__', displayDate) + '</div>';

    }

    return document.replace('__divDates_children__', children);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};

// Section 2: Board listing {
exports.setSimpleBoardCellLabels = function(board, cell) {

  cell = cell.replace('__labelPostsPerHour_inner__', board.postsPerHour || 0);

  cell = cell.replace('__labelUniqueIps_inner__', board.uniqueIps || 0);

  cell = cell.replace('__labelPostCount_inner__', board.lastPostId || 0);

  cell = cell.replace('__divDescription__', common
      .clean(board.boardDescription));

  return cell;

};

exports.setBoardCellIndicators = function(cell, removable, board) {

  var specialSettings = board.specialSettings || [];

  if (specialSettings.indexOf('sfw') < 0) {
    cell = cell.replace('__indicatorSfw_location__', '');
  } else {
    cell = cell.replace('__indicatorSfw_location__', removable.indicatorSfw);
  }

  if (!board.inactive) {
    cell = cell.replace('__indicatorInactive_location__', '');
  } else {
    cell = cell.replace('__indicatorInactive_location__',
        removable.indicatorInactive);
  }

  return cell;

};

exports.getBoardCell = function(board, language) {

  var cellTemplate = templateHandler(language, true).boardsCell;

  var boardUri = common.clean(board.boardUri);

  var cell = '<div class="boardsCell">' + cellTemplate.template;
  cell += '</div>';

  var linkContent = '/' + boardUri + '/ - ' + common.clean(board.boardName);

  cell = cell.replace('__linkBoard_href__', '/' + boardUri + '/');
  cell = cell.replace('__linkBoard_inner__', linkContent);

  cell = exports.setSimpleBoardCellLabels(board, cell);

  if (board.tags) {

    cell = cell.replace('__labelTags_location__',
        cellTemplate.removable.labelTags);

    cell = cell.replace('__labelTags_inner__', common.clean(board.tags
        .join(', ')));

  } else {
    cell = cell.replace('__labelTags_location__', '');
  }

  return exports.setBoardCellIndicators(cell, cellTemplate.removable, board);

};

exports.getBoardPageLinkBoilerPlate = function(parameters) {

  var href = '';

  if (parameters.boardUri) {
    href += '&boardUri=' + parameters.boardUri;
  }

  if (parameters.sfw) {
    href += '&sfw=1';
  }

  if (parameters.tags) {
    href += '&tags=' + parameters.tags;
  }

  if (parameters.inactive) {
    href += '&inactive=1';
  }

  if (parameters.sorting) {
    href += '&sorting=' + parameters.sorting;
  }

  return common.clean(href);

};

exports.getPages = function(parameters, pageCount) {

  var boilerPlate = exports.getBoardPageLinkBoilerPlate(parameters);

  var children = '';

  for (var j = 1; j <= pageCount; j++) {

    var link = '<a href="/boards.js?page=' + j + boilerPlate + '">';
    link += j + '</a>';

    children += link;
  }

  return children;

};

exports.setBoards = function(boards, document, language) {

  var children = '';

  var cellTemplate = templateHandler(language, true).boardsCell;

  for (var i = 0; i < boards.length; i++) {
    var board = boards[i];

    children += exports.getBoardCell(board, language);

  }

  return document.replace('__divBoards_children__', children);

};

exports.setOverboardLinks = function(template) {

  var document = template.template;

  if (overboard) {
    document = document.replace('__linkOverboard_location__',
        template.removable.linkOverboard);

    document = document
        .replace('__linkOverboard_href__', '/' + overboard + '/');

  } else {
    document = document.replace('__linkOverboard_location__', '');
  }

  if (sfwOverboard) {

    document = document.replace('__linkSfwOver_location__',
        template.removable.linkSfwOver);

    var href = '/' + sfwOverboard + '/';
    document = document.replace('__linkSfwOver_href__', href);

  } else {
    document = document.replace('__linkSfwOver_location__', '');
  }

  return document;

};

exports.boards = function(parameters, boards, pageCount, language) {
  try {

    var template = templateHandler(language, true).boardsPage;

    var document = exports.setOverboardLinks(template).replace('__title__',
        lang(language).titBoards);

    document = exports.setBoards(boards, document, language);

    return document.replace('__divPages_children__', exports.getPages(
        parameters, pageCount));

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};
// } Section 2: Board listing

// Section 3: Ban {
exports.getBanPage = function(ban, language) {

  var template;

  if (ban.range) {
    template = templateHandler(language, true).rangeBanPage;
  } else {
    template = templateHandler(language, true).banPage;
  }

  var document = template.template;

  if (ban.range) {
    document = document.replace('__rangeLabel_inner__', ban.range.join('.'));
  } else {

    document = document.replace('__reasonLabel_inner__', common
        .clean(ban.reason));

    document = document.replace('__idLabel_inner__', ban._id);

    document = document.replace('__expirationLabel_inner__', common
        .formatDateToDisplay(ban.expiration, null, language));

    if (ban.appeal) {
      document = document.replace('__formAppeal_location__', '');
    } else {

      document = document.replace('__formAppeal_location__',
          template.removable.formAppeal);
      document = document.replace('__idIdentifier_value__', ban._id);

    }

  }

  return document;

};

exports.ban = function(ban, board, language) {

  try {

    var document = exports.getBanPage(ban, language).replace('__title__',
        lang(language).titBan);

    document = document.replace('__boardLabel_inner__', common.clean(board));

    return document;

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');

  }

};
// } Section 3: Ban

exports.hashBan = function(hashBans, language) {

  try {

    var document = templateHandler(language, true).hashBanPage.template
        .replace('__title__', lang(language).titHashBan);

    var children = '';

    var cellTemplate = templateHandler(language, true).hashBanCellDisplay;
    cellTemplate = cellTemplate.template;

    for (var i = 0; i < hashBans.length; i++) {

      var hashBan = hashBans[i];

      var cell = '<div class="hashBanCellDisplay">' + cellTemplate;

      cell = cell.replace('__labelFile_inner__', common.clean(hashBan.file));

      var boardToUse = hashBan.boardUri || lang(language).miscAllBoards;
      cell = cell.replace('__labelBoard_inner__', common.clean(boardToUse));

      children += cell + '</div>';

    }

    return document.replace('__hashBansPanel_children__', children);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};

exports.edit = function(parameters, posting, language) {
  try {

    var template = templateHandler(language, true).editPage;

    var document = template.template.replace('__labelMessageLength_inner__',
        messageLength).replace('__title__', lang(language).titEdit);

    document = document.replace('__fieldMessage_defaultValue__',
        posting.message);

    document = document
        .replace('__fieldSubject_value__', posting.subject || '');

    document = document.replace('__boardIdentifier_value__', common
        .clean(parameters.boardUri));

    if (parameters.threadId) {

      document = document.replace('__postIdentifier_location__', '');
      document = document.replace('__threadIdentifier_location__',
          template.removable.threadIdentifier);
      document = document.replace('__threadIdentifier_value__',
          parameters.threadId);

    } else {

      document = document.replace('__threadIdentifier_location__', '');
      document = document.replace('__postIdentifier_location__',
          template.removable.postIdentifier);
      document = document
          .replace('__postIdentifier_value__', parameters.postId);

    }

    return document;

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }
};

exports.noCookieCaptcha = function(parameters, captchaId, language) {

  try {

    var template = templateHandler(language, true).noCookieCaptchaPage;
    var document = template.template.replace('__title__',
        lang(language).titNoCookieCaptcha);

    if (!parameters.solvedCaptcha) {
      document = document.replace('__divSolvedCaptcha_location__', '');
    } else {
      document = document.replace('__divSolvedCaptcha_location__',
          template.removable.divSolvedCaptcha);

      document = document.replace('__labelCaptchaId_inner__',
          parameters.solvedCaptcha);

    }

    document = document.replace('__imageCaptcha_src__',
        '/captcha.js?captchaId=' + captchaId);

    return document.replace('__inputCaptchaId_value__', captchaId);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};

exports.blockBypass = function(valid, language) {

  try {

    var template = templateHandler(language, true).bypassPage;

    var document = template.template.replace('__title__',
        lang(language).titBlockbypass);

    if (!valid) {
      document = document.replace('__indicatorValidBypass_location__', '');
    } else {
      document = document.replace('__indicatorValidBypass_location__',
          template.removable.indicatorValidBypass);
    }

    if (!blockBypass) {
      document = document.replace('__renewForm_location__', '');
    } else {
      document = document.replace('__renewForm_location__',
          template.removable.renewForm);
    }

    return document;

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }
};

exports.graphs = function(dates, language) {

  try {

    var document = templateHandler(language, true).graphsIndexPage.template
        .replace('__title__', lang(language).titGraphs);

    var children = '';

    var cellTemplate = templateHandler(language, true).graphIndexCell.template;

    for (var i = 0; i < dates.length; i++) {

      var cell = '<div class="graphIndexCell">' + cellTemplate;

      var href = '/.global/graphs/' + logger.formatedDate(dates[i]) + '.png';
      var displayDate = common.formatDateToDisplay(dates[i], true, language);

      cell = cell.replace('__dateLink_href__', href);

      children += cell.replace('__dateLink_inner__', displayDate) + '</div>';

    }

    return document.replace('__divDates_children__', children);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};

exports.message = function(message, link, language) {

  try {

    var document = templateHandler(language, true).messagePage.template
        .replace('__title__', message);

    document = document.replace('__labelMessage_inner__', message);
    return document.replace('__linkRedirect_href__', link);

  } catch (error) {

    return error.stack.replace(/\n/g, '<br>');
  }

};