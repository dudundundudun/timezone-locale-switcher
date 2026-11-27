'use strict';

(function (root) {
  const PROFILE_GROUPS = [
    { id: 'vpn', label: 'Основные серверы VPN' },
    { id: 'extra', label: 'Дополнительные регионы' }
  ];

  const PROFILE_LIST = [
    {
      id: 'us_east',
      group: 'vpn',
      badge: 'EST',
      optionLabel: '🇺🇸 США — Эшберн / Атланта',
      tz: 'America/New_York',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_mountain',
      group: 'vpn',
      badge: 'MST',
      optionLabel: '🇺🇸 США — Денвер',
      tz: 'America/Denver',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'de_berlin',
      group: 'vpn',
      badge: 'DE',
      optionLabel: '🇩🇪 Германия — Берлин / Франкфурт',
      tz: 'Europe/Berlin',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'nl_amsterdam',
      group: 'vpn',
      badge: 'NL',
      optionLabel: '🇳🇱 Нидерланды — Амстердам',
      tz: 'Europe/Amsterdam',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'pl_warsaw',
      group: 'vpn',
      badge: 'PL',
      optionLabel: '🇵🇱 Польша — Варшава',
      tz: 'Europe/Warsaw',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'se_stockholm',
      group: 'vpn',
      badge: 'SE',
      optionLabel: '🇸🇪 Швеция — Стокгольм',
      tz: 'Europe/Stockholm',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'ch_zurich',
      group: 'vpn',
      badge: 'CH',
      optionLabel: '🇨🇭 Швейцария — Цюрих',
      tz: 'Europe/Zurich',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'jp_tokyo',
      group: 'vpn',
      badge: 'JP',
      optionLabel: '🇯🇵 Япония — Токио',
      tz: 'Asia/Tokyo',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_central',
      group: 'extra',
      badge: 'CST',
      optionLabel: '🇺🇸 США — Чикаго / Даллас (Central)',
      tz: 'America/Chicago',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_west',
      group: 'extra',
      badge: 'PST',
      optionLabel: '🇺🇸 США — Лос-Анджелес / Сиэтл (West)',
      tz: 'America/Los_Angeles',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'uk_london',
      group: 'extra',
      badge: 'UK',
      optionLabel: '🇬🇧 Великобритания — Лондон',
      tz: 'Europe/London',
      locale: 'en-GB',
      languages: ['en-GB', 'en-US', 'en'],
      acceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8'
    }
  ];

  const LEGACY_PROFILE_ALIASES = {
    eu_central: 'de_berlin'
  };

  const PROFILES = Object.create(null);
  for (const item of PROFILE_LIST) {
    PROFILES[item.id] = item;
  }

  function resolveProfileId(id) {
    if (id && PROFILES[id]) return id;
    if (id && LEGACY_PROFILE_ALIASES[id] && PROFILES[LEGACY_PROFILE_ALIASES[id]]) {
      return LEGACY_PROFILE_ALIASES[id];
    }
    return 'us_east';
  }

  function getProfile(id) {
    return PROFILES[resolveProfileId(id)];
  }

  const DIRECT_EXPOSED_TIMEZONES = new Set([
    'Europe/Moscow',
    'Europe/Kaliningrad',
    'Europe/Samara',
    'Europe/Volgograd',
    'Europe/Saratov',
    'Europe/Astrakhan',
    'Europe/Ulyanovsk',
    'Europe/Kirov',
    'Europe/Minsk',
    'Asia/Yekaterinburg',
    'Asia/Omsk',
    'Asia/Novosibirsk',
    'Asia/Barnaul',
    'Asia/Tomsk',
    'Asia/Novokuznetsk',
    'Asia/Krasnoyarsk',
    'Asia/Irkutsk',
    'Asia/Chita',
    'Asia/Yakutsk',
    'Asia/Vladivostok',
    'Asia/Magadan',
    'Asia/Sakhalin',
    'Asia/Srednekolymsk',
    'Asia/Kamchatka',
    'Asia/Anadyr'
  ]);

  const COUNTRY_TO_PROFILE = {
    DE: 'de_berlin',
    NL: 'nl_amsterdam',
    PL: 'pl_warsaw',
    SE: 'se_stockholm',
    CH: 'ch_zurich',
    JP: 'jp_tokyo',
    KR: 'jp_tokyo',
    GB: 'uk_london',
    UK: 'uk_london',
    IE: 'uk_london',
    PT: 'uk_london'
  };

  const TZ_TO_PROFILE = {
    'America/New_York': 'us_east',
    'America/Detroit': 'us_east',
    'America/Toronto': 'us_east',
    'America/Montreal': 'us_east',
    'America/Indiana/Indianapolis': 'us_east',
    'America/Kentucky/Louisville': 'us_east',
    'America/Chicago': 'us_central',
    'America/Winnipeg': 'us_central',
    'America/Mexico_City': 'us_central',
    'America/Menominee': 'us_central',
    'America/Denver': 'us_mountain',
    'America/Boise': 'us_mountain',
    'America/Phoenix': 'us_mountain',
    'America/Edmonton': 'us_mountain',
    'America/Los_Angeles': 'us_west',
    'America/Vancouver': 'us_west',
    'America/Tijuana': 'us_west',
    'America/Anchorage': 'us_west',
    'Pacific/Honolulu': 'us_west',
    'Europe/Berlin': 'de_berlin',
    'Europe/Amsterdam': 'nl_amsterdam',
    'Europe/Warsaw': 'pl_warsaw',
    'Europe/Stockholm': 'se_stockholm',
    'Europe/Zurich': 'ch_zurich',
    'Europe/London': 'uk_london',
    'Europe/Dublin': 'uk_london',
    'Europe/Lisbon': 'uk_london',
    'Atlantic/Reykjavik': 'uk_london',
    'Asia/Tokyo': 'jp_tokyo',
    'Asia/Seoul': 'jp_tokyo'
  };

  function isDirectExposure(countryCode, timezone) {
    const cc = String(countryCode || '').trim().toUpperCase();
    const tz = String(timezone || '').trim();
    if (cc === 'RU' || cc === 'BY') return true;
    if (tz && DIRECT_EXPOSED_TIMEZONES.has(tz)) return true;
    return false;
  }

  function matchProfileFromGeo(countryCode, timezone) {
    const cc = String(countryCode || '').trim().toUpperCase();
    const tz = String(timezone || '').trim();

    if (!cc && !tz) {
      return { profileId: null, exposed: false };
    }

    if (isDirectExposure(cc, tz)) {
      return { profileId: null, exposed: true };
    }

    if (tz && TZ_TO_PROFILE[tz]) {
      return { profileId: TZ_TO_PROFILE[tz], exposed: false };
    }

    if (cc && COUNTRY_TO_PROFILE[cc]) {
      return { profileId: COUNTRY_TO_PROFILE[cc], exposed: false };
    }

    if (tz.startsWith('America/Indiana/') || tz.startsWith('America/Kentucky/')) {
      return { profileId: 'us_east', exposed: false };
    }
    if (tz.startsWith('America/North_Dakota/')) {
      return { profileId: 'us_central', exposed: false };
    }

    if (cc === 'US' || cc === 'CA') {
      return { profileId: 'us_east', exposed: false };
    }
    if (tz.startsWith('Europe/')) {
      return { profileId: 'de_berlin', exposed: false };
    }
    if (tz.startsWith('Asia/') || tz.startsWith('Australia/') || tz.startsWith('Pacific/')) {
      return { profileId: 'jp_tokyo', exposed: false };
    }
    if (tz.startsWith('America/')) {
      return { profileId: 'us_east', exposed: false };
    }

    return { profileId: 'de_berlin', exposed: false };
  }

  const DEFAULT_VPN_STATUS = {
    ip: '',
    countryCode: '',
    city: '',
    timezone: '',
    matchedProfileId: '',
    exposed: false,
    checkedAt: 0,
    error: ''
  };

  root.TZ_PROFILES_DATA = {
    PROFILE_GROUPS,
    PROFILE_LIST,
    PROFILES,
    DEFAULT_STATE: {
      enabled: true,
      profileId: 'us_east',
      autoVpn: true,
      spoofLang: true,
      cdpMode: false,
      excludedSites: []
    },
    DEFAULT_VPN_STATUS,
    resolveProfileId,
    getProfile,
    isDirectExposure,
    matchProfileFromGeo
  };
})(globalThis);
