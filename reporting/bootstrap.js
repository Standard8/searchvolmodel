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
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryController",
  "resource://gre/modules/TelemetryController.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryEnvironment",
  "resource://gre/modules/TelemetryEnvironment.jsm");

const kTelemetryPingDelay = 30000;

// Preferences this add-on uses.
const kPrefPrefix = "extensions.searchvolmodel.";
const PREF_GUID = `${kPrefPrefix}guid`;
const PREF_LOGGING = `${kPrefPrefix}logging`;
const PREF_TELEMETRY_SENT = `${kPrefPrefix}additionaltelemetrysent`;
const PREF_DISTRIBUTION_ID = "distribution.id";

// Logging
const log = Log.repository.getLogger("extensions.searchvolmodelextra.bootstrap");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
// Useful log levels: All = -1, Warn = 50, Info = 40, Debug = 20, Trace = 10, see Log.jsm
log.level = Services.prefs.getIntPref(PREF_LOGGING, Log.Level.Warn);

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
  Services.prefs.clearUserPref(PREF_TELEMETRY_SENT);
}

function sendTelemetryPing() {
  if (Services.prefs.getBoolPref(PREF_TELEMETRY_SENT, false)) {
    // We should only need to send once.
    return;
  }

  Services.prefs.setBoolPref(PREF_TELEMETRY_SENT, true);

  let guid = Services.prefs.getStringPref(PREF_GUID, "");
  if (!guid) {
    // No guid, nothing to report.
    log.info("Extra: No guid, nothing to report")
    return;
  }

  let type = `searchvolextra`;
  let additionalInfo = {
    distributionId: Services.prefs.getStringPref(PREF_DISTRIBUTION_ID, ""),
    guid
  };

  log.info(`Extra: Reporting info to telemetry`, additionalInfo);
  let fullEnvironment = TelemetryEnvironment.currentEnvironment;
  let activeExperiment =
    fullEnvironment.addons ? fullEnvironment.addons.activeExperiment : "";
  let experiments =
    fullEnvironment.experiments ? fullEnvironment.experiments : {};

  TelemetryController.submitExternalPing(type, additionalInfo, {
    addClientId: false,
    addEnvironment: true,
    overrideEnvironment: {
      addons: {
        activeExperiment
      },
      experiments
    }
  });
}

/**
 * Called when the add-on starts up.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being started.
 */
function startup(data, reason) {
  // We don't need to send it straight away, so give it a little while to not delay
  // startup - this also gives distribution id time to be set if we're starting Firefox.
  setTimeout(sendTelemetryPing, kTelemetryPingDelay);
}

/**
 * Called when the add-on shuts down.
 *
 * @param {Object} data Data about the add-on.
 * @param {Number} reason Indicates why the extension is being shut down.
 */
function shutdown(data, reason) {
}
