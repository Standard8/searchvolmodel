/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SerpMonitor",
  "chrome://searchvolmodel/content/SerpMonitor.jsm");

// Preferences this add-on uses.
const kPrefPrefix = "extensions.searchvolmodel.";
const PREF_LOGGING = `${kPrefPrefix}logging`;

const kExtensionID = "searchvolmodel@mozilla.com";
const kRegisterSerpMsg = `${kExtensionID}:register-serp`;
const kDeregisterSerpMsg = `${kExtensionID}:deregister-serp`;
const kShutdownMsg = `${kExtensionID}:shutdown`;

const frameScript = `chrome://searchvolmodel/content/serp-fs.js?q=${Math.random()}`;

var gLoggingEnabled = true;
var gTelemetryActivated = false;

/**
 * Logs a message to the console if logging is enabled.
 *
 * @param {String} message The message to log.
 */
function log(message) {
  if (gLoggingEnabled) {
    console.log("Search Volume Modeling", message);
  }
}

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
  log(message.name);
  log(info);
  SerpMonitor.serpTabs.set(info.url, info);
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
  log(message.name);
  log(info);
  SerpMonitor.serpTabs.delete(info.url);
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
  Services.mm.addMessageListener(kDeregisterSerpMsg, handleDeregisterSerpMsg);
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

/**
 * cohortManager is used to decide which users to enable the add-on for.
 */
var cohortManager = {
  // Indicates whether the telemetry should be enabled.
  enableForUser: false,

  // Records if we've already run init.
  _definedThisSession: false,

  /**
   * Initialises the manager, working out if telemetry should be enabled
   * for the user.
   */
  init() {
    if (this._definedThisSession) {
      return;
    }

    this._definedThisSession = true;
    this.enableForUser = false;

    try {
      let distId = Services.prefs.getCharPref("distribution.id", "");
      if (distId) {
        log("It is a distribution, not setting up nor enabling telemetry.");
        return;
      }
    } catch (e) {}

    log("Enabling telemetry for user");
    this.enableForUser = true;
  },
};

/**
 * Called when the add-on is installed.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being installed.
 */
function install(data, reason) {
  try {
    gLoggingEnabled = Services.prefs.getBoolPref(PREF_LOGGING, false);
  } catch (e) {
    // Needed until Firefox 54
  }

  cohortManager.init();
  if (cohortManager.enableForUser) {
    activateTelemetry();
  }
}

/**
 * Called when the add-on is uninstalled.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being uninstalled.
 */
function uninstall(data, reason) {
  deactivateTelemetry();
}

/**
 * Called when the add-on starts up.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being started.
 */
function startup(data, reason) {
  try {
    gLoggingEnabled = Services.prefs.getBoolPref(PREF_LOGGING, false);
  } catch (e) {
    // Needed until Firefox 54
  }

  cohortManager.init();

  if (cohortManager.enableForUser) {
    // Workaround for bug 1202125
    // We need to delay our loading so that when we are upgraded,
    // our new script doesn't get the shutdown message.
    setTimeout(() => {
      activateTelemetry();
    }, 1000);
  }
}

/**
 * Called when the add-on shuts down.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being shut down.
 */
function shutdown(data, reason) {
  deactivateTelemetry();
}
