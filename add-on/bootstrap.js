/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global APP_SHUTDOWN:false */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/Log.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SerpMonitor",
  "chrome://searchvolmodel/content/SerpMonitor.jsm");

// Preferences this add-on uses.
const kPrefPrefix = "extensions.searchvolmodel.";
const PREF_LOGGING = `${kPrefPrefix}logging`;
const PREF_GUID = `${kPrefPrefix}guid`;

const kExtensionID = "searchvolmodel@mozilla.com";
const kRegisterSerpMsg = `${kExtensionID}:register-serp`;
const kDeregisterSerpMsg = `${kExtensionID}:deregister-serp`;
const kShutdownMsg = `${kExtensionID}:shutdown`;

const frameScript = `chrome://searchvolmodel/content/serp-fs.js?q=${Math.random()}`;

var gTelemetryActivated = false;

// Logging
const log = Log.repository.getLogger("extensions.searchvolmodel.bootstrap");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
// Useful log levels: All = -1, Warn = 50, Info = 40, Debug = 20, Trace = 10, see Log.jsm
log.level = Services.prefs.getIntPref("extensions.searchvolmodel.logging", Log.Level.Warn);

/**
 * Handles receiving a message from the content process to resgister a SERP.
 *
 * @param {Object} message The message received.
 */
function handleRegisterSerpMsg(message) {
  if (message.name != kRegisterSerpMsg) {
    throw new Error(`Unexpected message received: ${message.name}`);
  }

  let info = message.data;
  log.debug(message.name, message.data);
  SerpMonitor.addSerpTab(info.url, message.target, info);
}

/**
 * Handles receiving a message from the content process to deregister a SERP.
 *
 * @param {Object} message The message received.
 */
function handleDeregisterSerpMsg(message) {
  if (message.name != kDeregisterSerpMsg) {
    throw new Error(`Unexpected message received: ${message.name}`);
  }

  let info = message.data;
  log.debug(message.name, message.data);
  SerpMonitor.removeSerpTab(info.url, message.target);
}

/**
 * Activates recording of telemetry if it isn't already activated.
 */
function activateTelemetry() {
  if (gTelemetryActivated) {
    return;
  }

  gTelemetryActivated = true;

  Services.mm.addMessageListener(kRegisterSerpMsg, handleRegisterSerpMsg);
  Services.mm.addMessageListener(kDeregisterSerpMsg, handleDeregisterSerpMsg, true);
  Services.mm.loadFrameScript(frameScript, true);
  Cc["@mozilla.org/network/http-activity-distributor;1"]
    .getService(Ci.nsIHttpActivityDistributor)
    .addObserver(SerpMonitor);
}

/**
 * Deactivites recording of telemetry if it isn't already deactivated.
 */
function deactivateTelemetry() {
  if (!gTelemetryActivated) {
    return;
  }

  Services.mm.removeMessageListener(kRegisterSerpMsg, handleRegisterSerpMsg);
  Services.mm.removeMessageListener(kDeregisterSerpMsg, handleDeregisterSerpMsg);
  Services.mm.removeDelayedFrameScript(frameScript);
  Services.mm.broadcastAsyncMessage(kShutdownMsg);
  Cc["@mozilla.org/network/http-activity-distributor;1"]
    .getService(Ci.nsIHttpActivityDistributor)
    .removeObserver(SerpMonitor);

  gTelemetryActivated = false;
}

function ensureGuid() {
  let guid = Services.prefs.getStringPref(PREF_GUID, "");
  if (guid !== "") {
    return guid;
  }
  // We assume the guid is not set, in any case, overwriting it is probably
  // a good thing if it is set.
  const {generateUUID} = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);
  // generateUUID adds leading and trailing "{" and "}". strip them off.
  guid = generateUUID().toString().slice(1, -1);
  Services.prefs.setStringPref(PREF_GUID, guid);
  return guid;
}

/**
 * Called when the add-on is installed.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being installed.
 */
function install(data, reason) {
  // Nothing specifically to do, startup will set everything up for us.
}

/**
 * Called when the add-on is uninstalled.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being uninstalled.
 */
function uninstall(data, reason) {
  Services.prefs.clearUserPref(PREF_GUID);
}

/**
 * Called when the add-on starts up.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being started.
 */
function startup(data, reason) {
  log.info("Enabling SearchVol telemetry");
  SerpMonitor.init(ensureGuid());
  // Workaround for bug 1202125
  // We need to delay our loading so that when we are upgraded,
  // our new script doesn't get the shutdown message.
  setTimeout(() => {
    activateTelemetry();
  }, 1000);
}

/**
 * Called when the add-on shuts down.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being shut down.
 */
function shutdown(data, reason) {
  // If we're shutting down, skip the cleanup to save time.
  if (reason === APP_SHUTDOWN) {
    return;
  }

  deactivateTelemetry();
}
