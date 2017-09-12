/* global user_pref */

// Bug 1393805 - Need to lower the security level for now.
user_pref("security.sandbox.content.level", 2);

// Items to enable the extension to be run in nightly.
user_pref("extensions.legacy.enabled", true);
user_pref("xpinstall.signatures.required", false);
