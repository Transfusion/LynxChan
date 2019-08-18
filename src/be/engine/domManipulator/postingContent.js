'use strict';

var lang;
var common;
var minClearIpRole;
var miscOps;
var redactedModNames;

exports.maxPreviewBreaks = 16;

exports.loadSettings = function() {

  var settings = require('../../settingsHandler').getGeneralSettings();

  redactedModNames = settings.redactModNames;
  minClearIpRole = settings.clearIpMinRole;

};

exports.loadDependencies = function() {
  lang = require('../langOps').languagePack;
  common = require('./common');
  miscOps = require('../miscOps');
};

exports.setSharedSimpleElements = function(postingCell, posting, innerPage,
    modding, removable, language) {

  var name = common.clean(posting.name);

  postingCell = postingCell.replace('__linkName_inner__', name);

  if (posting.email) {

    var email = 'mailto:' + common.clean(posting.email);

    postingCell = postingCell.replace('__linkName_href__', email);
    postingCell = postingCell.replace('__linkName_class__', '');

  } else {
    postingCell = postingCell.replace('__linkName_class__', ' noEmailName');
    postingCell = postingCell.replace('href="__linkName_href__"', '');
  }

  postingCell = postingCell.replace('__labelCreated_inner__', common
      .formatDateToDisplay(posting.creation, null, language));

  postingCell = exports.addMessage(innerPage, modding, postingCell, posting,
      removable);

  return postingCell;

};

exports.setPostingFlag = function(posting, postingCell, removable) {

  if (posting.flag) {

    postingCell = postingCell
        .replace('__imgFlag_location__', removable.imgFlag);

    postingCell = postingCell.replace('__imgFlag_src__', posting.flag);
    postingCell = postingCell.replace('__imgFlag_title__', posting.flagName);

    if (posting.flagCode) {

      var flagClass = ' flag' + posting.flagCode;

      postingCell = postingCell.replace(' __imgFlag_class__', flagClass);
    } else {
      postingCell = postingCell.replace(' __imgFlag_class__', '');
    }

  } else {
    postingCell = postingCell.replace('__imgFlag_location__', '');
  }

  return postingCell;

};

exports.setPostingLinks = function(postingCell, posting, innerPage, modding,
    removable) {

  var boardUri = common.clean(posting.boardUri);

  var linkStart = '';

  if (!innerPage) {
    if (modding) {
      linkStart = '/mod.js?boardUri=' + boardUri + '&threadId=';
      linkStart += posting.threadId;
    } else {
      linkStart = '/' + boardUri + '/res/' + posting.threadId + '.html';
    }

  }

  linkStart += '#';

  var selfId = posting.postId || posting.threadId;

  var linkSelf = linkStart + selfId;
  postingCell = postingCell.replace('__linkSelf_href__', linkSelf);

  var linkQuote = linkStart + 'q' + selfId;
  postingCell = postingCell.replace('__linkQuote_href__', linkQuote).replace(
      '__linkQuote_inner__', selfId);

  return postingCell;

};

exports.setPostingIp = function(cell, postingData, boardData, userRole,
    removable, preview) {

  if (preview) {
    boardData = boardData[postingData.boardUri];
  }

  if (!boardData) {
    boardData = {};
  }

  if (userRole <= minClearIpRole) {
    cell = cell.replace('__panelRange_location__', '');
  } else {
    cell = cell.replace('__panelRange_location__', removable.panelRange);

    cell = cell.replace('__labelBroadRange_inner__', miscOps.hashIpForDisplay(
        miscOps.getRange(postingData.ip), boardData.ipSalt));

    cell = cell.replace('__labelNarrowRange_inner__', miscOps.hashIpForDisplay(
        miscOps.getRange(postingData.ip, true), boardData.ipSalt));
  }

  var urlAffix = '?boardUri=' + postingData.boardUri + '&';

  if (postingData.postId) {
    urlAffix += 'postId=' + postingData.postId;
  } else {
    urlAffix += 'threadId=' + postingData.threadId;
  }

  return cell.replace('__labelIp_inner__',
      miscOps.hashIpForDisplay(postingData.ip, boardData.ipSalt, userRole))
      .replace('__linkHistory_href__', '/latestPostings.js' + urlAffix)
      .replace('__linkFileHistory_href__', '/mediaManagement.js' + urlAffix);

};

exports.setPostingModdingElements = function(modding, posting, cell, bData,
    userRole, removable, preview) {

  if (modding || preview) {
    var editLink = '/edit.js?boardUri=' + common.clean(posting.boardUri);

    if (posting.postId) {
      editLink += '&postId=' + posting.postId;
    } else {
      editLink += '&threadId=' + posting.threadId;
    }

    cell = cell.replace('__linkEdit_location__', removable.linkEdit).replace(
        '__linkEdit_href__', editLink);
  } else {
    cell = cell.replace('__linkEdit_location__', '');
  }

  if (modding && posting.asn) {
    cell = cell.replace('__panelASN_location__', removable.panelASN).replace(
        '__labelASN_inner__', posting.asn);
  } else {
    cell = cell.replace('__panelASN_location__', '');
  }

  // Due to technical limitations regarding individual caches, I decided to show
  // the link to users that are not in the global staff.
  if ((modding || preview) && posting.ip) {
    cell = cell.replace('__panelIp_location__', removable.panelIp).replace(
        '__linkHistory_location__', removable.linkHistory).replace(
        '__linkFileHistory_location__', removable.linkFileHistory);

    cell = exports.setPostingIp(cell, posting, bData, userRole, removable,
        preview);

  } else {
    cell = cell.replace('__panelIp_location__', '').replace(
        '__linkHistory_location__', '').replace('__linkFileHistory_location__',
        '');
  }

  return cell;

};

exports.setPostingComplexElements = function(posting, postingCell, removable,
    preview) {

  if (posting.signedRole) {
    postingCell = postingCell.replace('__labelRole_location__',
        removable.labelRole).replace('__labelRole_inner__', posting.signedRole);

  } else {
    postingCell = postingCell.replace('__labelRole_location__', '');
  }

  var checkboxName = common.clean(posting.boardUri) + '-' + posting.threadId;
  if (posting.postId) {
    checkboxName += '-' + posting.postId;
  }

  if (preview) {
    postingCell = postingCell.replace('__deletionCheckBox_location__', '');
  } else {
    postingCell = postingCell.replace('__deletionCheckBox_location__',
        removable.deletionCheckBox);

    postingCell = postingCell
        .replace('__deletionCheckBox_name__', checkboxName);
  }

  return postingCell;

};

exports.setSharedHideableElements = function(posting, removable, postingCell,
    language) {

  if (posting.lastEditTime) {

    var formatedDate = common.formatDateToDisplay(posting.lastEditTime, null,
        language);

    postingCell = postingCell.replace('__labelLastEdit_location__',
        removable.labelLastEdit).replace(
        '__labelLastEdit_inner__',
        lang(language).guiEditInfo.replace('{$date}', formatedDate).replace(
            '{$login}',
            redactedModNames ? lang(language).guiRedactedName : common
                .clean(posting.lastEditLogin)));

  } else {
    postingCell = postingCell.replace('__labelLastEdit_location__', '');
  }

  postingCell = exports.setPostingFlag(posting, postingCell, removable);

  if (posting.subject) {
    postingCell = postingCell.replace('__labelSubject_location__',
        removable.labelSubject).replace('__labelSubject_inner__',
        common.clean(posting.subject));
  } else {
    postingCell = postingCell.replace('__labelSubject_location__', '');
  }

  if (posting.id) {
    postingCell = postingCell.replace('__spanId_location__', removable.spanId)
        .replace('__labelId_inner__', posting.id).replace('__labelId_style__',
            'background-color: #' + posting.id);
  } else {
    postingCell = postingCell.replace('__spanId_location__', '');
  }

  if (!posting.banMessage) {
    postingCell = postingCell.replace('__divBanMessage_location__', '');
  } else {
    postingCell = postingCell.replace('__divBanMessage_location__',
        removable.divBanMessage).replace('__divBanMessage_inner__',
        common.clean(posting.banMessage));
  }

  return postingCell;

};

exports.addMessage = function(innerPage, modding, cell, posting, removable) {

  var markdown = posting.markdown;

  var arrayToUse = (markdown.match(/<br>/g) || []);

  if (!innerPage && arrayToUse.length > exports.maxPreviewBreaks) {

    cell = cell.replace('__contentOmissionIndicator_location__',
        removable.contentOmissionIndicator);

    markdown = markdown.split('<br>', exports.maxPreviewBreaks + 1)
        .join('<br>');

    if (!modding) {
      var href = '/' + posting.boardUri + '/res/' + posting.threadId + '.html';
    } else {
      href = '/mod.js?boardUri=' + posting.boardUri + '&threadId=';
      href += posting.threadId;
    }

    href += '#' + (posting.postId || posting.threadId);

    cell = cell.replace('__linkFullText_href__', href);

  } else {
    cell = cell.replace('__contentOmissionIndicator_location__', '');
  }

  return cell.replace('__divMessage_inner__', common.clean(common
      .matchCodeTags(markdown)));

};

exports.setAllSharedPostingElements = function(postingCell, posting, removable,
    language, modding, innerPage, userRole, boardData, preview) {

  postingCell = exports.setPostingModdingElements(modding, posting,
      postingCell, boardData, userRole, removable, preview);

  postingCell = exports.setSharedHideableElements(posting, removable,
      postingCell, language);

  postingCell = exports.setPostingLinks(postingCell, posting, innerPage,
      modding, removable);

  postingCell = exports.setPostingComplexElements(posting, postingCell,
      removable, preview);

  postingCell = exports.setSharedSimpleElements(postingCell, posting,
      innerPage, modding, removable, language);

  if (!posting.files || !posting.files.length) {
    return postingCell.replace('__panelUploads_location__', '');
  }

  postingCell = postingCell.replace('__panelUploads_location__',
      removable.panelUploads);

  postingCell = postingCell.replace(' __panelUploads_class__',
      posting.files.length > 1 ? ' multipleUploads' : '');

  return postingCell.replace('__panelUploads_children__', common.setUploadCell(
      posting.files, modding, language));

};
