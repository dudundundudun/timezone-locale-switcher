'use strict';

const {
  PROFILE_GROUPS,
  PROFILE_LIST,
  DEFAULT_STATE,
  DEFAULT_VPN_STATUS,
  resolveProfileId,
  getProfile
} = window.TZ_PROFILES_DATA;

const elEnabled = document.getElementById('toggleEnabled');
const elProfile = document.getElementById('profileSelect');
const elProfileField = document.getElementById('profileField');
const elExcludeSite = document.getElementById('toggleExcludeSite');
const elSiteExcludeCard = document.getElementById('siteExcludeCard');
const elSiteExcludeRow = document.getElementById('siteExcludeRow');
const elAutoVpn = document.getElementById('toggleAutoVpn');
const elAutoVpnRow = document.getElementById('autoVpnRow');
const elVpnStatusHint = document.getElementById('vpnStatusHint');
const elCheckVpnBtn = document.getElementById('checkVpnBtn');
const elLang = document.getElementById('toggleLang');
const elLangHint = document.getElementById('langHint');
const elCdp = document.getElementById('toggleCdp');
const elMain = document.getElementById('mainControls');
const elDot = document.getElementById('statusDot');
const elClock = document.getElementById('liveClock');
const elSummary = document.getElementById('tzSummary');
const elDomainHint = document.getElementById('currentDomainHint');
const elExcludedChips = document.getElementById('excludedChips');
const elExcludedCountLabel = document.getElementById('excludedCountLabel');
const elAddDomainForm = document.getElementById('addDomainForm');
const elDomainInput = document.getElementById('domainInput');
const elReload = document.getElementById('reloadBtn');

let currentState = Object.assign({}, DEFAULT_STATE);
let currentVpnStatus = Object.assign({}, DEFAULT_VPN_STATUS);
let activeTabId = null;
let activeDomain = null;
let pendingReload = false;
let checkingVpn = false;

function populateProfileSelect() {
  elProfile.textContent = '';
  for (const grp of PROFILE_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = grp.label;
    const items = PROFILE_LIST.filter((p) => p.group === grp.id);
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.optionLabel;
      optgroup.appendChild(opt);
    }
    if (optgroup.children.length > 0) {
      elProfile.appendChild(optgroup);
    }
  }
}

function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
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

function isCurrentSiteExcluded() {
  if (!activeDomain || !Array.isArray(currentState.excludedSites)) return false;
  return currentState.excludedSites.some((d) => {
    const norm = normalizeDomain(d);
    return norm && (activeDomain === norm || activeDomain.endsWith('.' + norm));
  });
}

function getMatchedExcludedDomain() {
  if (!activeDomain || !Array.isArray(currentState.excludedSites)) return null;
  for (const d of currentState.excludedSites) {
    const norm = normalizeDomain(d);
    if (norm && (activeDomain === norm || activeDomain.endsWith('.' + norm))) {
      return norm;
    }
  }
  return null;
}

function renderVpnStatus() {
  elVpnStatusHint.classList.remove('hint-ok', 'hint-danger');
  elAutoVpnRow.classList.remove('vpn-exposed');
  elCheckVpnBtn.classList.toggle('spinning', checkingVpn);

  if (checkingVpn) {
    elVpnStatusHint.textContent = 'Проверяю выходной IP...';
    return;
  }

  if (!currentState.autoVpn) {
    elVpnStatusHint.textContent = 'Выкл · ручной выбор региона выше';
    return;
  }

  if (currentVpnStatus.error) {
    elVpnStatusHint.textContent = `Ошибка проверки IP (${currentVpnStatus.error})`;
    return;
  }

  if (currentVpnStatus.exposed) {
    elAutoVpnRow.classList.add('vpn-exposed');
    elVpnStatusHint.classList.add('hint-danger');
    const loc = currentVpnStatus.city
      ? `${currentVpnStatus.countryCode || 'RU'} · ${currentVpnStatus.city}`
      : (currentVpnStatus.countryCode || 'RU');
    elVpnStatusHint.textContent = `⚠️ Виден IP ${loc} (VPN выключен?)`;
    return;
  }

  if (currentVpnStatus.countryCode || currentVpnStatus.timezone) {
    elVpnStatusHint.classList.add('hint-ok');
    const parts = [currentVpnStatus.countryCode, currentVpnStatus.city].filter(Boolean).join(' · ');
    const tzPart = currentVpnStatus.timezone ? ` (${currentVpnStatus.timezone})` : '';
    elVpnStatusHint.textContent = `IP: ${parts || 'VPN'}${tzPart}`;
    return;
  }

  elVpnStatusHint.textContent = 'Ожидание проверки IP...';
}

function updateClockAndSummary() {
  const profile = getProfile(currentState.profileId);

  if (!currentState.enabled) {
    elClock.textContent = 'Подмена отключена';
    elSummary.textContent = 'Системный пояс и язык';
    return;
  }

  if (isCurrentSiteExcluded()) {
    elClock.textContent = `Исключён · ${activeDomain}`;
    elSummary.textContent = 'На этом сайте: системный пояс и язык';
    return;
  }

  try {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: profile.tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    const shortTz = new Intl.DateTimeFormat('en-US', {
      timeZone: profile.tz,
      timeZoneName: 'shortOffset'
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value || '';

    elClock.textContent = `${timeStr} · ${shortTz}`;
  } catch (_) {
    elClock.textContent = profile.tz;
  }

  const langLabel = currentState.spoofLang ? profile.locale : 'Системный язык';
  elSummary.textContent = `${profile.tz} · ${langLabel}`;
}

function renderExcludedChips() {
  const list = Array.isArray(currentState.excludedSites) ? currentState.excludedSites : [];
  elExcludedCountLabel.textContent = list.length > 0
    ? `Исключённые сайты (${list.length})`
    : 'Исключённые сайты (без подмены)';
  elExcludedChips.textContent = '';

  list.forEach((domain) => {
    const chip = document.createElement('span');
    chip.className = 'chip';

    const label = document.createElement('span');
    label.textContent = domain;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-remove';
    btn.title = `Вернуть подмену для ${domain}`;
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      const next = (currentState.excludedSites || []).filter(
        (d) => normalizeDomain(d) !== normalizeDomain(domain)
      );
      saveState({ excludedSites: next });
    });

    chip.appendChild(label);
    chip.appendChild(btn);
    elExcludedChips.appendChild(chip);
  });
}

function renderUI() {
  const isEnabled = Boolean(currentState.enabled);
  const siteExcluded = isCurrentSiteExcluded();
  const vpnExposed = isEnabled && Boolean(currentState.autoVpn) && Boolean(currentVpnStatus.exposed);
  const resolvedId = resolveProfileId(currentState.profileId);
  const profile = getProfile(resolvedId);

  elEnabled.checked = isEnabled;
  elMain.classList.toggle('disabled', !isEnabled);
  elDot.classList.toggle('off', !isEnabled);
  elDot.classList.toggle('danger', vpnExposed && !siteExcluded);
  elDot.classList.toggle('bypass', isEnabled && siteExcluded);
  elProfileField.classList.toggle('dimmed', isEnabled && siteExcluded);
  elSiteExcludeCard.classList.toggle('active-bypass', isEnabled && siteExcluded);

  elProfile.value = resolvedId;
  elAutoVpn.checked = Boolean(currentState.autoVpn);
  elLang.checked = Boolean(currentState.spoofLang);
  elLangHint.textContent = `Accept-Language, Intl и голоса (${profile.locale})`;
  elCdp.checked = Boolean(currentState.cdpMode);

  if (activeDomain) {
    elSiteExcludeRow.classList.remove('disabled-row');
    elExcludeSite.disabled = false;
    elExcludeSite.checked = siteExcluded;
    elDomainHint.textContent = siteExcluded
      ? `Подмена выключена на ${activeDomain}`
      : `Сейчас открыт: ${activeDomain}`;
  } else {
    elSiteExcludeRow.classList.add('disabled-row');
    elExcludeSite.disabled = true;
    elExcludeSite.checked = false;
    elDomainHint.textContent = 'Системная вкладка (ниже можно ввести домен)';
  }

  if (pendingReload && activeDomain) {
    elReload.classList.add('needs-reload');
    elReload.textContent = '↻ Обновить вкладку';
  } else {
    elReload.classList.remove('needs-reload');
    elReload.textContent = 'Обновить вкладку';
  }

  renderVpnStatus();
  renderExcludedChips();
  updateClockAndSummary();
}

async function saveState(patch) {
  currentState = Object.assign({}, currentState, patch);
  currentState.profileId = resolveProfileId(currentState.profileId);
  if (activeDomain) {
    pendingReload = true;
  }
  await chrome.storage.local.set(currentState);
  renderUI();
}

async function requestManualVpnCheck() {
  if (checkingVpn) return;
  checkingVpn = true;
  renderVpnStatus();
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_VPN_NOW' });
    if (res && res.vpnStatus) {
      currentVpnStatus = Object.assign({}, DEFAULT_VPN_STATUS, res.vpnStatus);
    }
    if (res && res.switchedTo) {
      currentState.profileId = resolveProfileId(res.switchedTo);
      if (activeDomain) pendingReload = true;
    }
  } catch (_) {}
  checkingVpn = false;
  renderUI();
}

async function init() {
  populateProfileSelect();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    activeTabId = tab.id;
    try {
      const u = new URL(tab.url || '');
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        activeDomain = normalizeDomain(u.hostname);
      }
    } catch (_) {}
  }

  const keysToRead = Object.assign({}, DEFAULT_STATE, { vpnStatus: DEFAULT_VPN_STATUS });
  const stored = await chrome.storage.local.get(keysToRead);
  currentVpnStatus = Object.assign({}, DEFAULT_VPN_STATUS, stored.vpnStatus || {});
  delete stored.vpnStatus;

  currentState = Object.assign({}, DEFAULT_STATE, stored);
  currentState.profileId = resolveProfileId(currentState.profileId);
  if (!Array.isArray(currentState.excludedSites)) {
    currentState.excludedSites = [];
  }

  renderUI();
  setInterval(updateClockAndSummary, 1000);

  // Refresh VPN IP on popup open if autoVpn is enabled and last check was >20s ago
  if (currentState.enabled && currentState.autoVpn && Date.now() - (currentVpnStatus.checkedAt || 0) > 20000) {
    requestManualVpnCheck();
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.vpnStatus && changes.vpnStatus.newValue) {
    currentVpnStatus = Object.assign({}, DEFAULT_VPN_STATUS, changes.vpnStatus.newValue);
  }
  if (changes.profileId && changes.profileId.newValue) {
    const nextId = resolveProfileId(changes.profileId.newValue);
    if (nextId !== currentState.profileId && activeDomain) {
      pendingReload = true;
    }
    currentState.profileId = nextId;
  }
  if (changes.autoVpn !== undefined) {
    currentState.autoVpn = Boolean(changes.autoVpn.newValue);
  }
  renderUI();
});

elEnabled.addEventListener('change', () => {
  saveState({ enabled: elEnabled.checked });
});

elProfile.addEventListener('change', () => {
  // Choosing a profile manually turns off autoVpn so background polling won't override manual choice
  saveState({ profileId: elProfile.value, autoVpn: false });
});

elAutoVpn.addEventListener('change', async () => {
  const enabledAuto = elAutoVpn.checked;
  await saveState({ autoVpn: enabledAuto });
  if (enabledAuto) {
    requestManualVpnCheck();
  }
});

elCheckVpnBtn.addEventListener('click', async () => {
  if (!currentState.autoVpn) {
    await saveState({ autoVpn: true });
  }
  requestManualVpnCheck();
});

elExcludeSite.addEventListener('change', () => {
  if (!activeDomain) return;
  const list = Array.isArray(currentState.excludedSites) ? currentState.excludedSites.slice() : [];
  if (elExcludeSite.checked) {
    if (!list.includes(activeDomain)) {
      list.push(activeDomain);
    }
    saveState({ excludedSites: list });
  } else {
    const matched = getMatchedExcludedDomain() || activeDomain;
    const next = list.filter((d) => normalizeDomain(d) !== matched && normalizeDomain(d) !== activeDomain);
    saveState({ excludedSites: next });
  }
});

elAddDomainForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const dom = normalizeDomain(elDomainInput.value);
  if (!dom || !dom.includes('.')) return;
  const list = Array.isArray(currentState.excludedSites) ? currentState.excludedSites.slice() : [];
  if (!list.includes(dom)) {
    list.push(dom);
    saveState({ excludedSites: list });
  }
  elDomainInput.value = '';
});

elLang.addEventListener('change', () => {
  saveState({ spoofLang: elLang.checked });
});

elCdp.addEventListener('change', () => {
  saveState({ cdpMode: elCdp.checked });
});

elReload.addEventListener('click', () => {
  if (activeTabId) {
    pendingReload = false;
    chrome.tabs.reload(activeTabId);
    window.close();
  }
});

init();
