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

  root.TZ_PROFILES_DATA = {
    PROFILE_GROUPS,
    PROFILE_LIST,
    PROFILES,
    DEFAULT_STATE: {
      enabled: true,
      profileId: 'us_east',
      spoofLang: true,
      cdpMode: false,
      excludedSites: []
    },
    resolveProfileId,
    getProfile
  };
})(globalThis);
