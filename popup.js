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
  excludedSites: []
};

const elEnabled = document.getElementById('toggleEnabled');
const elProfile = document.getElementById('profileSelect');
const elProfileField = document.getElementById('profileField');
const elExcludeSite = document.getElementById('toggleExcludeSite');
const elSiteExcludeCard = document.getElementById('siteExcludeCard');
const elSiteExcludeRow = document.getElementById('siteExcludeRow');
const elLang = document.getElementById('toggleLang');
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
let activeTabId = null;
let activeDomain = null;

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

function updateClockAndSummary() {
  const profile = PROFILES[currentState.profileId] || PROFILES.us_east;

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
      const next = (currentState.excludedSites || []).filter((d) => normalizeDomain(d) !== normalizeDomain(domain));
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

  elEnabled.checked = isEnabled;
  elMain.classList.toggle('disabled', !isEnabled);
  elDot.classList.toggle('off', !isEnabled);
  elDot.classList.toggle('bypass', isEnabled && siteExcluded);
  elProfileField.classList.toggle('dimmed', isEnabled && siteExcluded);
  elSiteExcludeCard.classList.toggle('active-bypass', isEnabled && siteExcluded);

  elProfile.value = PROFILES[currentState.profileId] ? currentState.profileId : 'us_east';
  elLang.checked = Boolean(currentState.spoofLang);
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

  renderExcludedChips();
  updateClockAndSummary();
}

async function saveState(patch) {
  currentState = Object.assign({}, currentState, patch);
  await chrome.storage.local.set(currentState);
  renderUI();
}

async function init() {
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

  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  currentState = Object.assign({}, DEFAULT_STATE, stored);
  if (!Array.isArray(currentState.excludedSites)) {
    currentState.excludedSites = [];
  }
  renderUI();
  setInterval(updateClockAndSummary, 1000);
}

elEnabled.addEventListener('change', () => {
  saveState({ enabled: elEnabled.checked });
});

elProfile.addEventListener('change', () => {
  saveState({ profileId: elProfile.value });
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
    chrome.tabs.reload(activeTabId);
    window.close();
  }
});

init();
