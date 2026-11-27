'use strict';

const PROFILES = {
  "us_east": {
    "id": "us_east",
    "label": "US East — Atlanta / Ashburn",
    "tz": "America/New_York",
    "locale": "en-US",
    "languages": [
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-US,en;q=0.9"
  },
  "us_mountain": {
    "id": "us_mountain",
    "label": "US Mountain — Denver",
    "tz": "America/Denver",
    "locale": "en-US",
    "languages": [
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-US,en;q=0.9"
  },
  "us_central": {
    "id": "us_central",
    "label": "US Central — Chicago / Dallas",
    "tz": "America/Chicago",
    "locale": "en-US",
    "languages": [
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-US,en;q=0.9"
  },
  "us_west": {
    "id": "us_west",
    "label": "US West — Los Angeles / Seattle",
    "tz": "America/Los_Angeles",
    "locale": "en-US",
    "languages": [
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-US,en;q=0.9"
  },
  "uk_london": {
    "id": "uk_london",
    "label": "UK — London",
    "tz": "Europe/London",
    "locale": "en-GB",
    "languages": [
      "en-GB",
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-GB,en-US;q=0.9,en;q=0.8"
  },
  "eu_central": {
    "id": "eu_central",
    "label": "Europe — Frankfurt / Amsterdam",
    "tz": "Europe/Berlin",
    "locale": "en-US",
    "languages": [
      "en-US",
      "en"
    ],
    "acceptLanguage": "en-US,en;q=0.9"
  }
};

const DEFAULT_STATE = {
  enabled: true,
  profileId: 'us_east',
  spoofLang: true,
  cdpMode: false,
  excludedSites: [] // array of normalized base domains, e.g. ["kinopoisk.ru", "gosuslugi.ru"]
};

const DNR_RULE_ID = 1001;
const attachedTabs = new Set();

function normalizeDomain(host) {
  return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

function isUrlExcluded(urlStr, excludedSites) {
  if (!urlStr || !Array.isArray(excludedSites) || excludedSites.length === 0) return false;
  try {
    const u = new URL(urlStr);
    const h = normalizeDomain(u.hostname);
    if (!h) return false;
    return excludedSites.some((d) => {
      const norm = normalizeDomain(d);
      return norm && (h === norm || h.endsWith('.' + norm));
    });
  } catch (_) {
    return false;
  }
}

async function getState() {
  const data = await chrome.storage.local.get(DEFAULT_STATE);
  const state = Object.assign({}, DEFAULT_STATE, data);
  if (!Array.isArray(state.excludedSites)) {
    state.excludedSites = [];
  }
  state.excludedSites = Array.from(
    new Set(state.excludedSites.map(normalizeDomain).filter(Boolean))
  );
  return state;
}

// 1. Update Accept-Language HTTP Header via declarativeNetRequest (skipping excludedSites)
async function syncNetworkHeaders(state) {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID]
    });

    if (!state.enabled || !state.spoofLang) {
      return;
    }

    const profile = PROFILES[state.profileId] || PROFILES.us_east;
    const condition = {
      urlFilter: '*',
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'xmlhttprequest',
        'script',
        'stylesheet',
        'image',
        'font',
        'object',
        'ping',
        'other'
      ]
    };

    if (state.excludedSites && state.excludedSites.length > 0) {
      condition.excludedInitiatorDomains = state.excludedSites;
      condition.excludedRequestDomains = state.excludedSites;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: DNR_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'Accept-Language',
                operation: 'set',
                value: profile.acceptLanguage
              }
            ]
          },
          condition
        }
      ]
    });
  } catch (err) {
    console.warn('DNR sync error:', err);
  }
}

// 2. Register synchronous MAIN world scripts at document_start (excluding excludedSites)
async function syncContentScripts(state) {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    if (existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: existing.map((s) => s.id)
      });
    }

    if (!state.enabled) {
      return;
    }

    const langSuffix = state.spoofLang ? 'lang1' : 'lang0';
    const excludeMatches = [];
    for (const domain of state.excludedSites || []) {
      excludeMatches.push(`*://${domain}/*`);
      excludeMatches.push(`*://*.${domain}/*`);
    }

    const mainProfileId = PROFILES[state.profileId] ? state.profileId : 'us_east';
    const globalRule = {
      id: 'tz_global_main',
      matches: ['<all_urls>'],
      js: [`profiles/${mainProfileId}_${langSuffix}.js`, 'inject.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      matchOriginAsFallback: true
    };

    if (excludeMatches.length > 0) {
      globalRule.excludeMatches = excludeMatches;
    }

    await chrome.scripting.registerContentScripts([globalRule]);
  } catch (err) {
    console.warn('ContentScript sync error:', err);
  }
}

// 3. Optional CDP Engine Mode (skipping and detaching on excludedSites)
async function detachCdpFromTab(tabId) {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}
}

async function applyCdpToTab(tabId, urlStr, state) {
  if (!state.enabled || !state.cdpMode) {
    await detachCdpFromTab(tabId);
    return;
  }
  if (!urlStr || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'))) {
    return;
  }

  if (isUrlExcluded(urlStr, state.excludedSites)) {
    await detachCdpFromTab(tabId);
    return;
  }

  const profile = PROFILES[state.profileId] || PROFILES.us_east;
  const target = { tabId };

  try {
    if (!attachedTabs.has(tabId)) {
      await chrome.debugger.attach(target, '1.3');
      attachedTabs.add(tabId);
    }
    await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {
      timezoneId: profile.tz
    });
    if (state.spoofLang) {
      await chrome.debugger.sendCommand(target, 'Emulation.setLocaleOverride', {
        locale: profile.locale
      });
      await chrome.debugger.sendCommand(target, 'Network.enable', {});
      await chrome.debugger.sendCommand(target, 'Network.setExtraHTTPHeaders', {
        headers: { 'Accept-Language': profile.acceptLanguage }
      });
    }
  } catch (_) {}
}

async function detachAllCdp() {
  const tabs = Array.from(attachedTabs);
  attachedTabs.clear();
  for (const tabId of tabs) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_) {}
  }
}

async function syncCdpMode(state) {
  if (!state.enabled || !state.cdpMode) {
    await detachAllCdp();
    return;
  }
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await applyCdpToTab(tab.id, tab.url, state);
    }
  }
}

// 4. Badge indicator (shows SYS when current tab is excluded)
async function syncBadge(state) {
  if (!state.enabled) {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#475569' });
    return;
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && isUrlExcluded(activeTab.url, state.excludedSites)) {
      await chrome.action.setBadgeText({ text: 'SYS' });
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
      return;
    }
  } catch (_) {}

  const badgeMap = {
    us_east: 'EST',
    us_mountain: 'MST',
    us_central: 'CST',
    us_west: 'PST',
    uk_london: 'UK',
    eu_central: 'EU'
  };
  const txt = badgeMap[state.profileId] || 'ON';
  await chrome.action.setBadgeText({ text: txt });
  await chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
}

async function applyAllSettings() {
  const state = await getState();
  await Promise.all([
    syncNetworkHeaders(state),
    syncContentScripts(state),
    syncCdpMode(state),
    syncBadge(state)
  ]);
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  if (current.enabled === undefined) {
    await chrome.storage.local.set(DEFAULT_STATE);
  }
  await applyAllSettings();
});

chrome.runtime.onStartup.addListener(() => {
  applyAllSettings();
});

chrome.storage.onChanged.addListener(() => {
  applyAllSettings();
});

chrome.tabs.onActivated.addListener(async () => {
  const state = await getState();
  await syncBadge(state);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    const state = await getState();
    if (state.enabled && state.cdpMode) {
      await applyCdpToTab(tabId, tab.url, state);
    }
    if (tab.active) {
      await syncBadge(state);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source && source.tabId) {
    attachedTabs.delete(source.tabId);
  }
});
