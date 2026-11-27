'use strict';

const {
  PROFILE_GROUPS,
  PROFILE_LIST,
  DEFAULT_STATE,
  DEFAULT_VPN_STATUS,
  isValidTimeZone,
  resolveProfileId,
  getProfile
} = window.TZ_PROFILES_DATA;

const elEnabled = document.getElementById('toggleEnabled');
const elEngineBadge = document.getElementById('engineBadge');
const elProfile = document.getElementById('profileSelect');
const elProfileField = document.getElementById('profileField');
const elExcludeSite = document.getElementById('toggleExcludeSite');
const elSiteExcludeCard = document.getElementById('siteExcludeCard');
const elSiteExcludeRow = document.getElementById('siteExcludeRow');
const elAutoVpn = document.getElementById('toggleAutoVpn');
const elAutoVpnRow = document.getElementById('autoVpnRow');
const elVpnStatusHint = document.getElementById('vpnStatusHint');
const elCheckVpnBtn = document.getElementById('checkVpnBtn');
const elLeakAlert = document.getElementById('toggleLeakAlert');
const elLeakAlertRow = document.getElementById('leakAlertRow');
const elLeakAlertHint = document.getElementById('leakAlertHint');
const elLang = document.getElementById('toggleLang');
const elLangHint = document.getElementById('langHint');
const elCdp = document.getElementById('toggleCdp');
const elCdpHint = document.getElementById('cdpHint');
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

function getActiveDisplayTz() {
  const profile = getProfile(currentState.profileId);
  if (
    currentState.autoVpn &&
    currentState.cdpMode &&
    !currentVpnStatus.exposed &&
    isValidTimeZone(currentVpnStatus.timezone)
  ) {
    return currentVpnStatus.timezone;
  }
  return profile.tz;
}

function renderVpnStatus() {
  elVpnStatusHint.classList.remove('hint-ok', 'hint-warn', 'hint-danger');
  elAutoVpnRow.classList.remove('vpn-exposed');
  elLeakAlertRow.classList.remove('vpn-exposed');
  elLeakAlertHint.classList.remove('hint-danger');
  elCheckVpnBtn.classList.toggle('spinning', checkingVpn);

  const watchdogOn = Boolean(currentState.autoVpn || currentState.leakAlert);

  if (watchdogOn && currentVpnStatus.exposed) {
    const loc = currentVpnStatus.city
      ? `${currentVpnStatus.countryCode || 'RU'} · ${currentVpnStatus.city}`
      : (currentVpnStatus.countryCode || 'RU');
    const warnMsg = `⚠️ Виден IP ${loc} (VPN выключен?)`;
    elLeakAlertRow.classList.add('vpn-exposed');
    elLeakAlertHint.classList.add('hint-danger');
    elLeakAlertHint.textContent = warnMsg;
    elLeakAlertHint.title = warnMsg;
  } else {
    elLeakAlertHint.textContent = currentState.leakAlert
      ? 'Активен · красная метка RU! при обрыве'
      : 'Отключён';
    elLeakAlertHint.title = '';
  }

  if (checkingVpn) {
    elVpnStatusHint.textContent = 'Проверяю IP и узел Cloudflare...';
    elVpnStatusHint.title = '';
    return;
  }

  if (!currentState.autoVpn) {
    if (currentVpnStatus.colo || currentVpnStatus.countryCode) {
      const cfInfo = currentVpnStatus.colo ? ` · CF:${currentVpnStatus.colo}` : '';
      const txt = `Ручной режим (${currentVpnStatus.countryCode || 'IP'}${cfInfo})`;
      elVpnStatusHint.textContent = txt;
      elVpnStatusHint.title = txt;
    } else {
      elVpnStatusHint.textContent = 'Выкл · ручной выбор региона выше';
      elVpnStatusHint.title = '';
    }
    return;
  }

  if (currentVpnStatus.error) {
    const msg = `Ошибка проверки (${currentVpnStatus.error})`;
    elVpnStatusHint.textContent = msg;
    elVpnStatusHint.title = msg;
    return;
  }

  if (currentVpnStatus.exposed) {
    elAutoVpnRow.classList.add('vpn-exposed');
    elVpnStatusHint.classList.add('hint-danger');
    const loc = currentVpnStatus.city
      ? `${currentVpnStatus.countryCode || 'RU'} · ${currentVpnStatus.city}`
      : (currentVpnStatus.countryCode || 'RU');
    const msg = `⚠️ Виден IP ${loc} — маскировка удержана`;
    elVpnStatusHint.textContent = msg;
    elVpnStatusHint.title = msg;
    return;
  }

  if (currentVpnStatus.countryCode || currentVpnStatus.timezone || currentVpnStatus.colo) {
    const cfTag = currentVpnStatus.colo ? `CF:${currentVpnStatus.colo}` : '';
    if (currentVpnStatus.splitIp) {
      elVpnStatusHint.classList.add('hint-warn');
      const msg = `Разные маршруты! Взят ${cfTag || 'CF'} (${currentVpnStatus.timezone})`;
      elVpnStatusHint.textContent = msg;
      elVpnStatusHint.title = 'Cloudflare и GeoIP видят разные выходные IP в вашем прокси. Выбран пояс узла Cloudflare.';
      return;
    }

    elVpnStatusHint.classList.add('hint-ok');
    const locParts = [currentVpnStatus.countryCode, currentVpnStatus.city, cfTag].filter(Boolean).join(' · ');
    const tzPart = currentVpnStatus.timezone ? ` (${currentVpnStatus.timezone})` : '';
    const full = `${locParts || 'VPN'}${tzPart}`;
    elVpnStatusHint.textContent = full;
    elVpnStatusHint.title = full;
    return;
  }

  elVpnStatusHint.textContent = 'Ожидание проверки IP...';
  elVpnStatusHint.title = '';
}

function updateClockAndSummary() {
  const profile = getProfile(currentState.profileId);
  const displayTz = getActiveDisplayTz();

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
      timeZone: displayTz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    const shortTz = new Intl.DateTimeFormat('en-US', {
      timeZone: displayTz,
      timeZoneName: 'shortOffset'
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value || '';

    elClock.textContent = `${timeStr} · ${shortTz}`;
  } catch (_) {
    elClock.textContent = displayTz;
  }

  const langLabel = currentState.spoofLang ? profile.locale : 'Системный язык';
  elSummary.textContent = `${displayTz} · ${langLabel}`;
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
  const isCdp = Boolean(currentState.cdpMode);
  const siteExcluded = isCurrentSiteExcluded();
  const watchdogOn = Boolean(currentState.autoVpn || currentState.leakAlert);
  const vpnExposed = isEnabled && watchdogOn && Boolean(currentVpnStatus.exposed);
  const resolvedId = resolveProfileId(currentState.profileId);
  const profile = getProfile(resolvedId);

  elEnabled.checked = isEnabled;
  elMain.classList.toggle('disabled', !isEnabled);
  elDot.classList.toggle('off', !isEnabled);
  elDot.classList.toggle('cdp', isEnabled && isCdp && !vpnExposed && !siteExcluded);
  elDot.classList.toggle('danger', vpnExposed && !siteExcluded);
  elDot.classList.toggle('bypass', isEnabled && siteExcluded);
  elProfileField.classList.toggle('dimmed', isEnabled && siteExcluded);
  elSiteExcludeCard.classList.toggle('active-bypass', isEnabled && siteExcluded);

  elEngineBadge.textContent = isCdp ? 'CDP' : 'JS';
  elEngineBadge.classList.toggle('cdp-on', isCdp);
  elEngineBadge.title = isCdp
    ? 'Чистая C++ эмуляция Chromium (включая Turnstile OOPIF и Web Workers)'
    : 'Скрытая JS-инъекция на уровне прототипов V8';

  elProfile.value = resolvedId;
  elAutoVpn.checked = Boolean(currentState.autoVpn);
  elLeakAlert.checked = currentState.leakAlert !== undefined ? Boolean(currentState.leakAlert) : true;
  elLang.checked = Boolean(currentState.spoofLang);
  elLangHint.textContent = isCdp
    ? `Нативно через движок + DNR (${profile.locale})`
    : `Accept-Language, Intl и голоса (${profile.locale})`;
  elCdp.checked = isCdp;
  elCdpHint.textContent = isCdp
    ? 'Активен · 0% JS-патчей · OOPIF и Workers'
    : 'Без JS-патчей · фреймы Turnstile и Workers';

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
  if (activeDomain && !('leakAlert' in patch && Object.keys(patch).length === 1)) {
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
      const u = new URL(tab.pendingUrl || tab.url || '');
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
  if (currentState.leakAlert === undefined) {
    currentState.leakAlert = true;
  }
  if (!Array.isArray(currentState.excludedSites)) {
    currentState.excludedSites = [];
  }

  renderUI();
  setInterval(updateClockAndSummary, 1000);

  if (
    currentState.enabled &&
    (currentState.autoVpn || currentState.leakAlert) &&
    Date.now() - (currentVpnStatus.checkedAt || 0) > 20000
  ) {
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
  if (changes.leakAlert !== undefined) {
    currentState.leakAlert = Boolean(changes.leakAlert.newValue);
  }
  renderUI();
});

elEnabled.addEventListener('change', () => {
  saveState({ enabled: elEnabled.checked });
});

elProfile.addEventListener('change', () => {
  // Choosing a profile manually disables auto-switching, while keeping the RU! leak guard active
  saveState({ profileId: elProfile.value, autoVpn: false });
});

elAutoVpn.addEventListener('change', async () => {
  const enabledAuto = elAutoVpn.checked;
  await saveState({ autoVpn: enabledAuto });
  if (enabledAuto) {
    requestManualVpnCheck();
  }
});

elLeakAlert.addEventListener('change', async () => {
  const enabledLeak = elLeakAlert.checked;
  await saveState({ leakAlert: enabledLeak });
  if (enabledLeak) {
    requestManualVpnCheck();
  }
});

elCheckVpnBtn.addEventListener('click', async () => {
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
