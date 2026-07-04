/**
 * Tagvico AI — sidebar update notification
 *
 * Polls the GitHub releases API for the latest tag of arturict/tagvico-ai and
 * shows a small banner in the sidebar when a newer release exists than the
 * version reported by the running app. All network and parsing is wrapped in
 * try/catch — a GitHub outage must never break the app.
 */
(function () {
  'use strict';

  var REPO = 'arturict/tagvico-ai';
  var API_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  var FETCH_TIMEOUT_MS = 5000;
  var STORAGE_KEY = 'tagvico:update:dismissed';

  function $(selector) {
    return document.querySelector(selector);
  }

  function readCurrentVersion() {
    var app = window.TagvicoAIApp;
    if (!app || typeof app.version !== 'string') {
      return '';
    }
    return app.version.trim();
  }

  function stripPrefix(tag) {
    return String(tag || '').replace(/^v/i, '').trim();
  }

  function parseSemver(version) {
    var parts = String(version || '').split('.').map(function (part) {
      var match = /^\d+/.exec(part);
      return match ? parseInt(match[0], 10) : 0;
    });
    while (parts.length < 3) {
      parts.push(0);
    }
    return {
      major: parts[0],
      minor: parts[1],
      patch: parts[2]
    };
  }

  function isNewer(latest, current) {
    var a = parseSemver(latest);
    var b = parseSemver(current);
    if (a.major !== b.major) return a.major > b.major;
    if (a.minor !== b.minor) return a.minor > b.minor;
    return a.patch > b.patch;
  }

  function fetchLatestRelease() {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch unavailable'));
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    }
    return fetch(API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response || !response.ok) {
          throw new Error('GitHub responded ' + (response ? response.status : 'no response'));
        }
        return response.json();
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function getDismissedVersion() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function setDismissedVersion(version) {
    try {
      window.localStorage.setItem(STORAGE_KEY, version);
    } catch (err) {
      /* ignore storage errors (private mode, quota, etc.) */
    }
  }

  function showBanner(latestVersion, htmlUrl, currentVersion) {
    var banner = $('#appUpdateBanner');
    if (!banner) return;

    var textEl = banner.querySelector('.app-update-banner-text');
    var linkEl = banner.querySelector('.app-update-banner-link');
    var dismissBtn = banner.querySelector('.app-update-banner-dismiss');

    if (textEl) {
      textEl.textContent = 'New update available — v' + latestVersion;
    }
    if (linkEl) {
      linkEl.href = htmlUrl || ('https://github.com/' + REPO + '/releases/latest');
    }
    if (dismissBtn && !dismissBtn.dataset.bound) {
      dismissBtn.dataset.bound = '1';
      dismissBtn.addEventListener('click', function () {
        banner.hidden = true;
        // Track which app version the user dismissed at — upgrading the app
        // should let the banner re-appear for the newer release.
        setDismissedVersion(currentVersion);
      });
    }

    banner.hidden = false;
  }

  function checkForUpdate() {
    var current = readCurrentVersion();
    if (!current) {
      return;
    }

    // If the user previously dismissed the banner for this app version, the
    // banner stays hidden until they upgrade. After upgrade, current changes
    // and the dismissed-version check no longer matches, so the banner
    // re-appears for the new release.
    if (getDismissedVersion() === current) {
      return;
    }

    fetchLatestRelease()
      .then(function (release) {
        if (!release || typeof release.tag_name !== 'string') {
          return;
        }
        var latest = stripPrefix(release.tag_name);
        if (!latest) {
          return;
        }
        if (!isNewer(latest, current)) {
          return;
        }
        showBanner(latest, release.html_url, current);
      })
      .catch(function (err) {
        /* never break the app if GitHub is unreachable */
        if (typeof console !== 'undefined' && console && typeof console.debug === 'function') {
          console.debug('[tagvico] update check failed:', err && err.message ? err.message : err);
        }
      });
  }

  function init() {
    try {
      checkForUpdate();
      setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    } catch (err) {
      /* swallow — update check is best-effort */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
