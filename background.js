'use strict';

importScripts('profiles-data.js');

const {
  DEFAULT_STATE,
  DEFAULT_VPN_STATUS,
  resolveProfileId,
  getProfile,
  matchProfileFromGeo
} = self.TZ_PROFILES_DATA;

const DNR_RULE_ID = 1001;
const VPN_WATCHDOG_ALARM = 'tz_vpn_watchdog';
const SETTING_KEYS = ['enabled', 'profileId', 'autoVpn', 'spoofLang', 'cdpMode', 'excludedSites'];

function normalizeDomain(host) {
  let s = String(host || '').trim().toLowerCase();
  if (!s) return '';
  try {
    if (s.includes('://')) {
      s = new URL(s).hostname;
    } else {
      s = s.split('/')[0].split(':')[0];
    }
  } catch (_) {}
  return s.replace(/^www\./, '');
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
  const keysToRead = Object.assign({}, DEFAULT_STATE, { vpnStatus: DEFAULT_VPN_STATUS });
  const data = await chrome.storage.local.get(keysToRead);
  const state = Object.assign({}, DEFAULT_STATE, data);
  state.profileId = resolveProfileId(state.profileId);
  state.autoVpn = Boolean(state.autoVpn);
  if (!Array.isArray(state.excludedSites)) {
    state.excludedSites = [];
  }
  state.excludedSites = Array.from(
    new Set(state.excludedSites.map(normalizeDomain).filter(Boolean))
  );
  state.vpnStatus = Object.assign({}, DEFAULT_VPN_STATUS, data.vpnStatus || {});
  return state;
}

// 1. Update Accept-Language HTTP Header via declarativeNetRequest across ALL resource types (including WebSocket)
async function syncNetworkHeaders(state) {
  try {
    if (!state.enabled || !state.spoofLang) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [DNR_RULE_ID]
      });
      return;
    }

    const profile = getProfile(state.profileId);
    const condition = {
      urlFilter: '*',
      excludedResourceTypes: [] // Matches ALL resource types including main_frame, websocket, media, xmlhttprequest, etc.
    };

    if (state.excludedSites.length > 0) {
      condition.excludedInitiatorDomains = state.excludedSites;
      condition.excludedRequestDomains = state.excludedSites;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
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

    const profileId = resolveProfileId(state.profileId);
    const langFile = state.spoofLang ? 'profiles/_lang_on.js' : 'profiles/_lang_off.js';

    const excludeMatches = [];
    for (const domain of state.excludedSites) {
      excludeMatches.push(`*://${domain}/*`);
      excludeMatches.push(`*://*.${domain}/*`);
    }

    const globalRule = {
      id: 'tz_global_main',
      matches: ['<all_urls>'],
      js: [`profiles/${profileId}.js`, langFile, 'inject.js'],
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

// 3. Optional CDP Engine Mode (queries real Chrome debugger targets so Service Worker sleep never loses state)
async function getExtensionAttachedTabIds() {
  if (!chrome.debugger || typeof chrome.debugger.getTargets !== 'function') {
    return new Set();
  }
  try {
    const targets = await chrome.debugger.getTargets();
    const myId = chrome.runtime.id;
    const ids = new Set();
    for (const t of targets) {
      if (t.attached && typeof t.tabId === 'number' && (!t.extensionId || t.extensionId === myId)) {
        ids.add(t.tabId);
      }
    }
    return ids;
  } catch (_) {
    return new Set();
  }
}

async function detachCdpFromTab(tabId, attachedSet) {
  const known = attachedSet || await getExtensionAttachedTabIds();
  if (!known.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}
}

async function applyCdpToTab(tabId, urlStr, state, attachedSet) {
  const known = attachedSet || await getExtensionAttachedTabIds();

  if (!state.enabled || !state.cdpMode) {
    await detachCdpFromTab(tabId, known);
    return;
  }
  if (!urlStr || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'))) {
    await detachCdpFromTab(tabId, known);
    return;
  }
  if (isUrlExcluded(urlStr, state.excludedSites)) {
    await detachCdpFromTab(tabId, known);
    return;
  }

  const profile = getProfile(state.profileId);
  const target = { tabId };

  try {
    if (!known.has(tabId)) {
      await chrome.debugger.attach(target, '1.3');
      known.add(tabId);
    }

    await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {
      timezoneId: profile.tz
    });

    await chrome.debugger.sendCommand(target, 'Network.enable', {});
    if (state.spoofLang) {
      await chrome.debugger.sendCommand(target, 'Emulation.setLocaleOverride', {
        locale: profile.locale
      });
      await chrome.debugger.sendCommand(target, 'Network.setExtraHTTPHeaders', {
        headers: { 'Accept-Language': profile.acceptLanguage }
      });
    } else {
      await chrome.debugger.sendCommand(target, 'Emulation.setLocaleOverride', {
        locale: ''
      });
      await chrome.debugger.sendCommand(target, 'Network.setExtraHTTPHeaders', {
        headers: {}
      });
    }
  } catch (_) {}
}

async function detachAllCdp() {
  const attached = await getExtensionAttachedTabIds();
  await Promise.all(
    Array.from(attached).map(async (tabId) => {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_) {}
    })
  );
}

async function syncCdpMode(state) {
  if (!state.enabled || !state.cdpMode) {
    await detachAllCdp();
    return;
  }
  const [tabs, attached] = await Promise.all([
    chrome.tabs.query({}),
    getExtensionAttachedTabIds()
  ]);

  for (const tab of tabs) {
    if (tab.id) {
      await applyCdpToTab(tab.id, tab.url || '', state, attached);
    }
  }
}

// 4. Badge indicator (shows SYS on excluded sites, red RU! on VPN drop, or active region code)
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
      await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
      return;
    }
  } catch (_) {}

  if (state.autoVpn && state.vpnStatus && state.vpnStatus.exposed) {
    await chrome.action.setBadgeText({ text: 'RU!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  const profile = getProfile(state.profileId);
  await chrome.action.setBadgeText({ text: profile.badge || 'ON' });
  await chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
}

// 5. Auto-VPN GeoIP Watchdog & Network-Change Detector
const GEO_PROVIDERS = [
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse(d) {
      if (!d || (!d.country_code && !d.timezone)) return null;
      return {
        ip: String(d.ip || ''),
        countryCode: String(d.country_code || '').toUpperCase(),
        city: String(d.city || d.region || ''),
        timezone: String(d.timezone || '')
      };
    }
  },
  {
    url: 'https://ipwho.is/?output=json',
    parse(d) {
      if (!d || d.success === false) return null;
      const tz = d.timezone && typeof d.timezone === 'object' ? d.timezone.id : d.timezone;
      if (!d.country_code && !tz) return null;
      return {
        ip: String(d.ip || ''),
        countryCode: String(d.country_code || '').toUpperCase(),
        city: String(d.city || d.region || ''),
        timezone: String(tz || '')
      };
    }
  },
  {
    url: 'https://api.ip.sb/geoip',
    parse(d) {
      if (!d || (!d.country_code && !d.timezone)) return null;
      return {
        ip: String(d.ip || ''),
        countryCode: String(d.country_code || '').toUpperCase(),
        city: String(d.city || d.region || ''),
        timezone: String(d.timezone || '')
      };
    }
  }
];

async function fetchJsonNoStore(url, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGeoIpInfo() {
  for (const provider of GEO_PROVIDERS) {
    const raw = await fetchJsonNoStore(provider.url);
    const parsed = raw ? provider.parse(raw) : null;
    if (parsed && (parsed.countryCode || parsed.timezone)) {
      return parsed;
    }
  }
  return null;
}

let inFlightVpnCheck = null;

async function checkVpnLocation(force = false) {
  if (inFlightVpnCheck) return inFlightVpnCheck;

  inFlightVpnCheck = (async () => {
    try {
      const initialState = await getState();
      if (!force && (!initialState.enabled || !initialState.autoVpn)) {
        return { ok: false, skipped: true };
      }

      const geo = await fetchGeoIpInfo();
      const latestState = await getState();

      if (!geo) {
        const errStatus = Object.assign({}, latestState.vpnStatus, {
          checkedAt: Date.now(),
          error: 'Нет ответа от GeoIP'
        });
        await chrome.storage.local.set({ vpnStatus: errStatus });
        return { ok: false, vpnStatus: errStatus };
      }

      const match = matchProfileFromGeo(geo.countryCode, geo.timezone);
      const nextVpnStatus = {
        ip: geo.ip,
        countryCode: geo.countryCode,
        city: geo.city,
        timezone: geo.timezone,
        matchedProfileId: match.profileId || '',
        exposed: Boolean(match.exposed),
        checkedAt: Date.now(),
        error: ''
      };

      const patch = { vpnStatus: nextVpnStatus };
      let switchedTo = null;

      if (
        latestState.enabled &&
        latestState.autoVpn &&
        !match.exposed &&
        match.profileId &&
        match.profileId !== latestState.profileId
      ) {
        patch.profileId = match.profileId;
        switchedTo = match.profileId;
      }

      await chrome.storage.local.set(patch);
      return { ok: true, vpnStatus: nextVpnStatus, switchedTo };
    } finally {
      inFlightVpnCheck = null;
    }
  })();

  return inFlightVpnCheck;
}

let netDebounceFast = null;
let netDebounceVerify = null;

function onNetworkChanged() {
  if (netDebounceFast) clearTimeout(netDebounceFast);
  if (netDebounceVerify) clearTimeout(netDebounceVerify);

  // Fast probe once VPN route settles (~900ms), plus verification probe (~3.8s) for Hysteria2/LTE handshakes
  netDebounceFast = setTimeout(() => {
    checkVpnLocation(false).catch(() => {});
  }, 900);
  netDebounceVerify = setTimeout(() => {
    checkVpnLocation(false).catch(() => {});
  }, 3800);
}

async function syncVpnWatchdogAlarm(state) {
  if (!chrome.alarms) return;
  try {
    if (state.enabled && state.autoVpn) {
      const existing = await chrome.alarms.get(VPN_WATCHDOG_ALARM);
      if (!existing) {
        chrome.alarms.create(VPN_WATCHDOG_ALARM, { periodInMinutes: 2 });
      }
    } else {
      await chrome.alarms.clear(VPN_WATCHDOG_ALARM);
    }
  } catch (_) {}
}

// Serialized sync queue prevents race conditions ("Duplicate script ID") on rapid toggle clicks
let syncChain = Promise.resolve();
let syncQueued = false;

async function applyAllSettingsNow() {
  const state = await getState();
  await Promise.all([
    syncNetworkHeaders(state),
    syncContentScripts(state),
    syncCdpMode(state),
    syncBadge(state),
    syncVpnWatchdogAlarm(state)
  ]);
}

function scheduleApplyAllSettings() {
  if (syncQueued) return syncChain;
  syncQueued = true;
  syncChain = syncChain
    .then(async () => {
      syncQueued = false;
      await applyAllSettingsNow();
    })
    .catch((err) => {
      syncQueued = false;
      console.warn('Settings sync error:', err);
    });
  return syncChain;
}

if (self.navigator && self.navigator.connection && typeof self.navigator.connection.addEventListener === 'function') {
  self.navigator.connection.addEventListener('change', onNetworkChanged);
}
self.addEventListener('online', onNetworkChanged);

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === VPN_WATCHDOG_ALARM) {
      checkVpnLocation(false).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'CHECK_VPN_NOW') {
    checkVpnLocation(true)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const patch = {};
  if (current.enabled === undefined) {
    Object.assign(patch, DEFAULT_STATE);
  } else {
    if (current.profileId && resolveProfileId(current.profileId) !== current.profileId) {
      patch.profileId = resolveProfileId(current.profileId);
    }
    if (current.autoVpn === undefined) {
      patch.autoVpn = true;
    }
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
  await scheduleApplyAllSettings();
  checkVpnLocation(false).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  scheduleApplyAllSettings();
  checkVpnLocation(false).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const settingsChanged = SETTING_KEYS.some((k) => k in changes);
  if (settingsChanged) {
    scheduleApplyAllSettings();
    if ('autoVpn' in changes && changes.autoVpn.newValue === true) {
      checkVpnLocation(false).catch(() => {});
    }
  } else if ('vpnStatus' in changes) {
    getState().then(syncBadge).catch(() => {});
  }
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
