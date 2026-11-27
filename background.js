'use strict';

importScripts('profiles-data.js');

const {
  DEFAULT_STATE,
  DEFAULT_VPN_STATUS,
  isValidTimeZone,
  resolveProfileId,
  getProfile,
  resolveGeoConsensus
} = self.TZ_PROFILES_DATA;

const DNR_RULE_ID = 1001;
const DNR_BYPASS_INITIATOR_RULE_ID = 1002;
const DNR_BYPASS_TAB_RULE_ID = 1003;
const CONTENT_SCRIPT_ID = 'tz_global_main';
const VPN_WATCHDOG_ALARM = 'tz_vpn_watchdog';
const SETTING_KEYS = [
  'enabled',
  'profileId',
  'autoVpn',
  'leakAlert',
  'spoofLang',
  'cdpMode',
  'excludedSites'
];

// In-memory state cache for zero-latency CDP attachment on tab creation / target spawn
let cachedState = null;
// Track flattened child CDP sessions (OOPIF iframes like challenges.cloudflare.com + Web Workers)
const tabChildSessions = new Map();
let cachedUaPayloadPromise = null;

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

function isHttpUrl(urlStr) {
  return Boolean(urlStr && (urlStr.startsWith('http://') || urlStr.startsWith('https://')));
}

async function getState() {
  const keysToRead = Object.assign({}, DEFAULT_STATE, { vpnStatus: DEFAULT_VPN_STATUS });
  const data = await chrome.storage.local.get(keysToRead);
  const state = Object.assign({}, DEFAULT_STATE, data);
  state.profileId = resolveProfileId(state.profileId);
  state.autoVpn = Boolean(state.autoVpn);
  state.leakAlert = state.leakAlert !== undefined ? Boolean(state.leakAlert) : true;
  state.spoofLang = Boolean(state.spoofLang);
  state.cdpMode = Boolean(state.cdpMode);
  if (!Array.isArray(state.excludedSites)) {
    state.excludedSites = [];
  }
  state.excludedSites = Array.from(
    new Set(state.excludedSites.map(normalizeDomain).filter(Boolean))
  );
  state.vpnStatus = Object.assign({}, DEFAULT_VPN_STATUS, data.vpnStatus || {});
  cachedState = state;
  return state;
}

function getEffectiveTimezone(state) {
  if (
    state.autoVpn &&
    state.vpnStatus &&
    !state.vpnStatus.exposed &&
    isValidTimeZone(state.vpnStatus.timezone)
  ) {
    return state.vpnStatus.timezone;
  }
  return getProfile(state.profileId).tz;
}

function isWatchdogActive(state) {
  return Boolean(state.enabled && (state.autoVpn || state.leakAlert));
}

// Read genuine Chrome UA + Windows 11 High-Entropy Client Hints once so CDP setUserAgentOverride
// never strips platformVersion, bitness, architecture, formFactors, or fullVersionList
function getNativeUaPayload() {
  if (cachedUaPayloadPromise) return cachedUaPayloadPromise;
  cachedUaPayloadPromise = (async () => {
    const userAgent = (self.navigator && self.navigator.userAgent) || '';
    const platform = (self.navigator && self.navigator.platform) || '';
    let userAgentMetadata = null;
    try {
      const uad = self.navigator && self.navigator.userAgentData;
      if (uad && typeof uad.getHighEntropyValues === 'function') {
        const he = await uad.getHighEntropyValues([
          'architecture',
          'bitness',
          'brands',
          'formFactors',
          'fullVersionList',
          'mobile',
          'model',
          'platform',
          'platformVersion',
          'wow64'
        ]);
        const brands = Array.isArray(he.brands) ? he.brands : (Array.isArray(uad.brands) ? uad.brands : []);
        if (brands.length > 0 && he.platform) {
          userAgentMetadata = {
            brands: brands.map((b) => ({ brand: String(b.brand), version: String(b.version) })),
            platform: String(he.platform || ''),
            platformVersion: String(he.platformVersion || ''),
            architecture: String(he.architecture || ''),
            model: String(he.model || ''),
            mobile: Boolean(he.mobile)
          };
          if (Array.isArray(he.fullVersionList) && he.fullVersionList.length > 0) {
            userAgentMetadata.fullVersionList = he.fullVersionList.map((b) => ({
              brand: String(b.brand),
              version: String(b.version)
            }));
          }
          if (he.bitness) {
            userAgentMetadata.bitness = String(he.bitness);
          }
          if (typeof he.wow64 === 'boolean') {
            userAgentMetadata.wow64 = he.wow64;
          }
          if (Array.isArray(he.formFactors) && he.formFactors.length > 0) {
            userAgentMetadata.formFactors = he.formFactors.map((f) => String(f));
          }
        }
      }
    } catch (_) {}
    return { userAgent, platform, userAgentMetadata };
  })();
  return cachedUaPayloadPromise;
}

// 1. Update Accept-Language HTTP Header & Excluded-Tab Subframe Bypass via Session Rules
// Using session rules enables `excludedTabIds` / `tabIds`, ensuring cross-origin iframes (like
// challenges.cloudflare.com) inside an excluded site tab are 100% untouched in both headers and JS!
let legacyDynamicRulesCleared = false;

async function getExcludedTabIds(state) {
  if (!state.enabled || !Array.isArray(state.excludedSites) || state.excludedSites.length === 0) {
    return [];
  }
  try {
    const tabs = await chrome.tabs.query({});
    const ids = [];
    for (const t of tabs) {
      if (typeof t.id === 'number') {
        const u = t.pendingUrl || t.url || '';
        if (u && isUrlExcluded(u, state.excludedSites)) {
          ids.push(t.id);
        }
      }
    }
    return ids;
  } catch (_) {
    return [];
  }
}

async function syncNetworkHeaders(state) {
  try {
    if (!legacyDynamicRulesCleared) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [DNR_RULE_ID, DNR_BYPASS_INITIATOR_RULE_ID, DNR_BYPASS_TAB_RULE_ID]
      }).catch(() => {});
      legacyDynamicRulesCleared = true;
    }

    const removeRuleIds = [DNR_RULE_ID, DNR_BYPASS_INITIATOR_RULE_ID, DNR_BYPASS_TAB_RULE_ID];
    if (!state.enabled) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
      return;
    }

    const excludedTabIds = await getExcludedTabIds(state);
    const langRules = [];
    const bypassRules = [];

    if (state.spoofLang) {
      const profile = getProfile(state.profileId);
      const condition = {
        urlFilter: '*',
        excludedResourceTypes: []
      };

      if (state.excludedSites.length > 0) {
        condition.excludedInitiatorDomains = state.excludedSites;
        condition.excludedRequestDomains = state.excludedSites;
      }
      if (excludedTabIds.length > 0) {
        condition.excludedTabIds = excludedTabIds;
      }

      langRules.push({
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
      });
    }

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: langRules
    });

    // Signal `inject.js` inside cross-origin subframes (e.g. challenges.cloudflare.com) to abort at line 1
    // whenever the parent/top tab belongs to `excludedSites`
    if (!state.cdpMode && state.excludedSites.length > 0) {
      bypassRules.push({
        id: DNR_BYPASS_INITIATOR_RULE_ID,
        priority: 2,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'Server-Timing',
              operation: 'append',
              value: 'tz_bypass'
            }
          ]
        },
        condition: {
          initiatorDomains: state.excludedSites,
          resourceTypes: ['sub_frame']
        }
      });

      if (excludedTabIds.length > 0) {
        bypassRules.push({
          id: DNR_BYPASS_TAB_RULE_ID,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              {
                header: 'Server-Timing',
                operation: 'append',
                value: 'tz_bypass'
              }
            ]
          },
          condition: {
            tabIds: excludedTabIds,
            resourceTypes: ['sub_frame']
          }
        });
      }
    }

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_BYPASS_INITIATOR_RULE_ID, DNR_BYPASS_TAB_RULE_ID],
      addRules: bypassRules
    }).catch(() => {});
  } catch (err) {
    console.warn('DNR sync error:', err);
  }
}

function arraysEqual(a, b) {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) return false;
  }
  return true;
}

// 2. Atomic MAIN world content script registration (skipped completely in Zero-JS CDP Mode!)
async function syncContentScripts(state) {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const hasMain = existing.some((s) => s.id === CONTENT_SCRIPT_ID);
    const staleIds = existing.filter((s) => s.id !== CONTENT_SCRIPT_ID).map((s) => s.id);
    if (staleIds.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: staleIds });
    }

    // In CDP mode, C++ engine overrides handle Date, Intl, Temporal, and Navigator natively
    // across frames & workers — do NOT inject JS monkey-patches on top!
    if (!state.enabled || state.cdpMode) {
      if (hasMain) {
        await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
      }
      return;
    }

    const profileId = resolveProfileId(state.profileId);
    const langFile = state.spoofLang ? 'profiles/_lang_on.js' : 'profiles/_lang_off.js';
    const desiredJs = [`profiles/${profileId}.js`, langFile, 'inject.js'];

    const excludeMatches = [];
    for (const domain of state.excludedSites) {
      excludeMatches.push(`*://${domain}/*`);
      excludeMatches.push(`*://*.${domain}/*`);
    }

    const globalRule = {
      id: CONTENT_SCRIPT_ID,
      matches: ['<all_urls>'],
      js: desiredJs,
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true
    };

    if (excludeMatches.length > 0) {
      globalRule.excludeMatches = excludeMatches;
    } else {
      globalRule.excludeMatches = [];
    }

    if (hasMain) {
      const cur = existing.find((s) => s.id === CONTENT_SCRIPT_ID);
      if (
        cur &&
        arraysEqual(cur.js, desiredJs) &&
        arraysEqual(cur.excludeMatches || [], excludeMatches)
      ) {
        return;
      }
      // Atomic update without unregistration gap during startup tab restoration
      await chrome.scripting.updateContentScripts([globalRule]);
    } else {
      await chrome.scripting.registerContentScripts([globalRule]);
    }
  } catch (err) {
    console.warn('ContentScript sync error:', err);
  }
}

// 3. Pure Engine-Level CDP Mode (with OOPIF iframe + Web Worker auto-attach & zero Runtime/Network hooks)
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

let cdpKeepAliveTimer = null;

function updateCdpKeepAlive(shouldRun) {
  if (shouldRun) {
    if (!cdpKeepAliveTimer) {
      // Prevent MV3 Service Worker suspension while `waitForDebuggerOnStart: true` is active on tabs
      cdpKeepAliveTimer = setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {});
      }, 20000);
    }
  } else if (cdpKeepAliveTimer) {
    clearInterval(cdpKeepAliveTimer);
    cdpKeepAliveTimer = null;
  }
}

function recordChildSession(tabId, sessionId, targetType) {
  if (typeof tabId !== 'number' || !sessionId) return;
  let map = tabChildSessions.get(tabId);
  if (!map) {
    map = new Map();
    tabChildSessions.set(tabId, map);
  }
  map.set(sessionId, targetType || '');
}

function removeChildSession(tabId, sessionId) {
  const map = tabChildSessions.get(tabId);
  if (!map) return;
  if (sessionId) {
    map.delete(sessionId);
    if (map.size === 0) tabChildSessions.delete(tabId);
  } else {
    tabChildSessions.delete(tabId);
  }
}

function isWorkerTargetType(targetType) {
  return targetType === 'worker' || targetType === 'shared_worker' || targetType === 'service_worker';
}

async function applyOverridesToCdpTarget(debuggee, state, uaPayload, targetType) {
  const profile = getProfile(state.profileId);
  const tz = getEffectiveTimezone(state);
  const isWorker = isWorkerTargetType(targetType);
  const cmds = [
    chrome.debugger.sendCommand(debuggee, 'Emulation.setTimezoneOverride', {
      timezoneId: tz
    }).catch(() => {})
  ];

  if (state.spoofLang) {
    if (!isWorker) {
      cmds.push(
        chrome.debugger.sendCommand(debuggee, 'Emulation.setLocaleOverride', {
          locale: profile.locale
        }).catch(() => {})
      );
    }

    if (uaPayload && uaPayload.userAgent) {
      // Pass comma-separated language tags WITHOUT ';q=0.9' so Chromium sets clean navigator.languages
      const uaOverride = {
        userAgent: uaPayload.userAgent,
        acceptLanguage: profile.languages.join(',')
      };
      if (uaPayload.platform) {
        uaOverride.platform = uaPayload.platform;
      }
      if (uaPayload.userAgentMetadata) {
        uaOverride.userAgentMetadata = uaPayload.userAgentMetadata;
      }
      cmds.push(
        chrome.debugger.sendCommand(debuggee, 'Emulation.setUserAgentOverride', uaOverride).catch(() => {})
      );
    }
  } else {
    if (!isWorker) {
      cmds.push(
        chrome.debugger.sendCommand(debuggee, 'Emulation.setLocaleOverride', {
          locale: ''
        }).catch(() => {})
      );
    }
    cmds.push(
      chrome.debugger.sendCommand(debuggee, 'Emulation.setUserAgentOverride', {
        userAgent: ''
      }).catch(() => {})
    );
  }

  await Promise.all(cmds);
}

async function detachCdpFromTab(tabId, attachedSet) {
  removeChildSession(tabId);
  const known = attachedSet || await getExtensionAttachedTabIds();
  if (!known.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}
}

async function applyCdpToTab(tabId, urlStr, state, attachedSet) {
  const known = attachedSet || await getExtensionAttachedTabIds();

  if (!state.enabled || !state.cdpMode || !isHttpUrl(urlStr) || isUrlExcluded(urlStr, state.excludedSites)) {
    await detachCdpFromTab(tabId, known);
    return;
  }

  updateCdpKeepAlive(true);
  const target = { tabId };
  const uaPayload = await getNativeUaPayload();

  try {
    if (!known.has(tabId)) {
      await chrome.debugger.attach(target, '1.3');
      known.add(tabId);
    }

    await Promise.all([
      applyOverridesToCdpTarget(target, state, uaPayload, 'page'),
      // Auto-attach to out-of-process cross-origin iframes (e.g. challenges.cloudflare.com)
      // and Dedicated/Shared/Service Workers BEFORE their first script instruction runs
      chrome.debugger.sendCommand(target, 'Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true
      }).catch(() => {})
    ]);

    // Also refresh any already-attached child sessions on this tab
    const children = tabChildSessions.get(tabId);
    if (children && children.size > 0) {
      await Promise.all(
        Array.from(children.entries()).map(([sessionId, childType]) =>
          applyOverridesToCdpTarget({ tabId, sessionId }, state, uaPayload, childType)
        )
      );
    }
  } catch (_) {}
}

async function detachAllCdp() {
  updateCdpKeepAlive(false);
  tabChildSessions.clear();
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
  updateCdpKeepAlive(true);
  const [tabs, attached] = await Promise.all([
    chrome.tabs.query({}),
    getExtensionAttachedTabIds()
  ]);

  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return Promise.resolve();
      const targetUrl = tab.pendingUrl || tab.url || '';
      return applyCdpToTab(tab.id, targetUrl, state, attached);
    })
  );
}

if (chrome.debugger && chrome.debugger.onEvent) {
  chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (!source || typeof source.tabId !== 'number') return;

    if (method === 'Target.attachedToTarget') {
      const sessionId = params && params.sessionId;
      if (!sessionId) return;
      const targetType = (params.targetInfo && params.targetInfo.type) || '';
      recordChildSession(source.tabId, sessionId, targetType);
      const childTarget = { tabId: source.tabId, sessionId };
      try {
        const state = cachedState || await getState();
        if (state.enabled && state.cdpMode) {
          const uaPayload = await getNativeUaPayload();
          const tasks = [applyOverridesToCdpTarget(childTarget, state, uaPayload, targetType)];
          // Crucial: enable recursive auto-attach on OOPIF child frames (like challenges.cloudflare.com)
          // so Dedicated Web Workers spawned INSIDE cross-origin iframes get overridden too!
          if (!isWorkerTargetType(targetType)) {
            tasks.push(
              chrome.debugger.sendCommand(childTarget, 'Target.setAutoAttach', {
                autoAttach: true,
                waitForDebuggerOnStart: true,
                flatten: true
              }).catch(() => {})
            );
          }
          await Promise.all(tasks);
        }
      } catch (_) {
      } finally {
        // Always resume paused child target so OOPIF / Worker never stalls
        await chrome.debugger.sendCommand(childTarget, 'Runtime.runIfWaitingForDebugger', {}).catch(() => {});
      }
    } else if (method === 'Target.detachedFromTarget') {
      if (params && params.sessionId) {
        removeChildSession(source.tabId, params.sessionId);
      }
    }
  });
}

if (chrome.debugger && chrome.debugger.onDetach) {
  chrome.debugger.onDetach.addListener((source) => {
    if (source && typeof source.tabId === 'number') {
      removeChildSession(source.tabId);
    }
  });
}

// 4. Badge indicator (shows SYS on excluded sites, red RU! on VPN drop even in manual mode, or active region)
async function syncBadge(state) {
  if (!state.enabled) {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#475569' });
    return;
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = activeTab && (activeTab.pendingUrl || activeTab.url);
    if (tabUrl && isUrlExcluded(tabUrl, state.excludedSites)) {
      await chrome.action.setBadgeText({ text: 'SYS' });
      await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
      return;
    }
  } catch (_) {}

  if (isWatchdogActive(state) && state.vpnStatus && state.vpnStatus.exposed) {
    await chrome.action.setBadgeText({ text: 'RU!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  const profile = getProfile(state.profileId);
  await chrome.action.setBadgeText({ text: profile.badge || 'ON' });
  await chrome.action.setBadgeBackgroundColor({ color: state.cdpMode ? '#0d9488' : '#0284c7' });
}

// 5. Cloudflare-Synchronized GeoIP Consensus & Independent RU! Watchdog
const GEO_PROVIDERS = [
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
        timezone: String(tz || ''),
        lowAccuracy: !d.city && !d.region
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
        timezone: String(d.timezone || ''),
        lowAccuracy: !d.city && !d.region
      };
    }
  },
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse(d) {
      if (!d || (!d.country_code && !d.timezone)) return null;
      const cc = String(d.country_code || '').toUpperCase();
      const city = String(d.city || d.region || '');
      const acc = Number(d.accuracy || 0);
      // MaxMind GeoLite2 country-centroid fallback has accuracy >= 500km (e.g. Kansas America/Chicago for US)
      const lowAccuracy = acc >= 500 || !city;
      return {
        ip: String(d.ip || ''),
        countryCode: cc,
        city,
        timezone: String(d.timezone || ''),
        lowAccuracy
      };
    }
  }
];

const CF_TRACE_URLS = [
  'https://www.cloudflare.com/cdn-cgi/trace',
  'https://1.1.1.1/cdn-cgi/trace'
];

async function fetchWithTimeout(url, acceptHeader, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: acceptHeader ? { Accept: acceptHeader } : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    return res;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGeoIpInfo() {
  for (const provider of GEO_PROVIDERS) {
    const res = await fetchWithTimeout(provider.url, 'application/json', 4200);
    if (!res) continue;
    try {
      const raw = await res.json();
      const parsed = raw ? provider.parse(raw) : null;
      if (parsed && (parsed.countryCode || parsed.timezone)) {
        return parsed;
      }
    } catch (_) {}
  }
  return null;
}

function parseCfTraceText(text) {
  if (!text || typeof text !== 'string') return null;
  const map = Object.create(null);
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  if (!map.ip && !map.loc && !map.colo) return null;
  return {
    ip: map.ip || '',
    countryCode: (map.loc || '').toUpperCase(),
    colo: (map.colo || '').toUpperCase()
  };
}

async function fetchCloudflareTrace() {
  for (const url of CF_TRACE_URLS) {
    const res = await fetchWithTimeout(url, 'text/plain', 3500);
    if (!res) continue;
    try {
      const txt = await res.text();
      const parsed = parseCfTraceText(txt);
      if (parsed) return parsed;
    } catch (_) {}
  }
  return null;
}

let inFlightVpnCheck = null;

async function checkVpnLocation(force = false) {
  if (inFlightVpnCheck) return inFlightVpnCheck;

  inFlightVpnCheck = (async () => {
    try {
      const initialState = await getState();
      if (!force && !isWatchdogActive(initialState)) {
        return { ok: false, skipped: true };
      }

      // Query JSON GeoIP & Cloudflare's own edge in parallel so timezone always matches Cloudflare
      const [jsonGeo, cfTrace] = await Promise.all([
        fetchGeoIpInfo(),
        fetchCloudflareTrace()
      ]);

      const latestState = await getState();
      const consensus = resolveGeoConsensus(jsonGeo, cfTrace);

      if (!consensus) {
        const errStatus = Object.assign({}, latestState.vpnStatus, {
          checkedAt: Date.now(),
          error: 'Нет ответа от GeoIP / Cloudflare'
        });
        await chrome.storage.local.set({ vpnStatus: errStatus });
        return { ok: false, vpnStatus: errStatus };
      }

      const nextVpnStatus = {
        ip: consensus.ip,
        countryCode: consensus.countryCode,
        city: consensus.city,
        timezone: consensus.timezone,
        colo: consensus.colo,
        splitIp: Boolean(consensus.splitIp),
        matchedProfileId: consensus.matchedProfileId || '',
        exposed: Boolean(consensus.exposed),
        checkedAt: Date.now(),
        error: ''
      };

      const patch = { vpnStatus: nextVpnStatus };
      let switchedTo = null;

      if (
        latestState.enabled &&
        latestState.autoVpn &&
        !consensus.exposed &&
        consensus.matchedProfileId &&
        consensus.matchedProfileId !== latestState.profileId
      ) {
        patch.profileId = consensus.matchedProfileId;
        switchedTo = consensus.matchedProfileId;
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
    if (isWatchdogActive(state)) {
      const existing = await chrome.alarms.get(VPN_WATCHDOG_ALARM);
      if (!existing) {
        chrome.alarms.create(VPN_WATCHDOG_ALARM, { periodInMinutes: 2 });
      }
    } else {
      await chrome.alarms.clear(VPN_WATCHDOG_ALARM);
    }
  } catch (_) {}
}

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

// Warm up state, session rules & UA metadata immediately on Service Worker boot
scheduleApplyAllSettings();
getNativeUaPayload().catch(() => {});

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
    if (current.leakAlert === undefined) {
      patch.leakAlert = true;
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
    if (
      ('autoVpn' in changes && changes.autoVpn.newValue === true) ||
      ('leakAlert' in changes && changes.leakAlert.newValue === true)
    ) {
      checkVpnLocation(false).catch(() => {});
    }
  } else if ('vpnStatus' in changes) {
    getState()
      .then(async (state) => {
        await syncBadge(state);
        // If CDP mode is active and exact GeoIP timezone changed within same profile, refresh CDP tabs
        if (state.enabled && state.cdpMode && state.autoVpn) {
          await syncCdpMode(state);
        }
      })
      .catch(() => {});
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  const url = tab.pendingUrl || tab.url || '';
  if (!url) return;
  const state = cachedState || await getState();
  if (state.enabled && state.excludedSites.length > 0 && isUrlExcluded(url, state.excludedSites)) {
    await syncNetworkHeaders(state);
  }
  if (state.enabled && state.cdpMode && isHttpUrl(url)) {
    await applyCdpToTab(tab.id, url, state);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  removeChildSession(tabId);
  const state = cachedState || await getState();
  if (state.enabled && state.excludedSites.length > 0) {
    await syncNetworkHeaders(state);
  }
});

chrome.tabs.onActivated.addListener(async () => {
  const state = cachedState || await getState();
  await syncBadge(state);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && (tab.pendingUrl || tab.url)) || '';
  if ((changeInfo.status === 'loading' || changeInfo.url) && url) {
    const state = cachedState || await getState();
    if (state.enabled && state.excludedSites.length > 0) {
      await syncNetworkHeaders(state);
    }
    if (state.enabled && state.cdpMode) {
      await applyCdpToTab(tabId, url, state);
    }
    if (tab && tab.active) {
      await syncBadge(state);
    }
  }
});
