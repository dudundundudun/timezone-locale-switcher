'use strict';

(function (root) {
  const PROFILE_GROUPS = [
    { id: 'vpn', label: 'Основные серверы VPN' },
    { id: 'extra', label: 'Дополнительные регионы мира' }
  ];

  const PROFILE_LIST = [
    // Основные серверы VPN
    {
      id: 'us_east',
      group: 'vpn',
      badge: 'EST',
      optionLabel: '🇺🇸 США — Эшберн / Нью-Йорк / Майами',
      tz: 'America/New_York',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_central',
      group: 'vpn',
      badge: 'CST',
      optionLabel: '🇺🇸 США — Чикаго / Даллас (Central)',
      tz: 'America/Chicago',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_mountain',
      group: 'vpn',
      badge: 'MST',
      optionLabel: '🇺🇸 США — Денвер / Солт-Лейк',
      tz: 'America/Denver',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'us_west',
      group: 'vpn',
      badge: 'PST',
      optionLabel: '🇺🇸 США — Лос-Анджелес / Сиэтл',
      tz: 'America/Los_Angeles',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'de_berlin',
      group: 'vpn',
      badge: 'DE',
      optionLabel: '🇩🇪 Германия — Франкфурт / Берлин',
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
      id: 'fi_helsinki',
      group: 'vpn',
      badge: 'FI',
      optionLabel: '🇫🇮 Финляндия / Балтия — Хельсинки',
      tz: 'Europe/Helsinki',
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
      id: 'uk_london',
      group: 'vpn',
      badge: 'UK',
      optionLabel: '🇬🇧 Великобритания — Лондон',
      tz: 'Europe/London',
      locale: 'en-GB',
      languages: ['en-GB', 'en-US', 'en'],
      acceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8'
    },
    {
      id: 'jp_tokyo',
      group: 'vpn',
      badge: 'JP',
      optionLabel: '🇯🇵 Япония — Токио / Осака',
      tz: 'Asia/Tokyo',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },

    // Дополнительные регионы мира
    {
      id: 'us_phoenix',
      group: 'extra',
      badge: 'AZ',
      optionLabel: '🇺🇸 США — Финикс (Аризона, без DST)',
      tz: 'America/Phoenix',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'ca_toronto',
      group: 'extra',
      badge: 'CA',
      optionLabel: '🇨🇦 Канада — Торонто / Монреаль',
      tz: 'America/Toronto',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'br_saopaulo',
      group: 'extra',
      badge: 'BR',
      optionLabel: '🇧🇷 Бразилия — Сан-Паулу (UTC−3)',
      tz: 'America/Sao_Paulo',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'pt_lisbon',
      group: 'extra',
      badge: 'PT',
      optionLabel: '🇵🇹 Португалия — Лиссабон',
      tz: 'Europe/Lisbon',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'fr_paris',
      group: 'extra',
      badge: 'FR',
      optionLabel: '🇫🇷 Франция / Испания / Италия — Париж',
      tz: 'Europe/Paris',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'at_vienna',
      group: 'extra',
      badge: 'AT',
      optionLabel: '🇦🇹 Австрия / Чехия — Вена / Прага',
      tz: 'Europe/Vienna',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'ro_bucharest',
      group: 'extra',
      badge: 'RO',
      optionLabel: '🇷🇴 Румыния / Греция / Болгария (EET)',
      tz: 'Europe/Bucharest',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'tr_istanbul',
      group: 'extra',
      badge: 'TR',
      optionLabel: '🇹🇷 Турция — Стамбул (UTC+3)',
      tz: 'Europe/Istanbul',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'il_jerusalem',
      group: 'extra',
      badge: 'IL',
      optionLabel: '🇮🇱 Израиль — Тель-Авив',
      tz: 'Asia/Jerusalem',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'ae_dubai',
      group: 'extra',
      badge: 'AE',
      optionLabel: '🇦🇪 ОАЭ / Кавказ — Дубай (UTC+4)',
      tz: 'Asia/Dubai',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'kz_almaty',
      group: 'extra',
      badge: 'KZ',
      optionLabel: '🇰🇿 Казахстан / ЦА — Алматы (UTC+5)',
      tz: 'Asia/Almaty',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'in_kolkata',
      group: 'extra',
      badge: 'IN',
      optionLabel: '🇮🇳 Индия — Мумбаи / Дели (UTC+5:30)',
      tz: 'Asia/Kolkata',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'th_bangkok',
      group: 'extra',
      badge: 'TH',
      optionLabel: '🇹🇭 Таиланд / Вьетнам — Бангкок (UTC+7)',
      tz: 'Asia/Bangkok',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'sg_singapore',
      group: 'extra',
      badge: 'SG',
      optionLabel: '🇸🇬 Сингапур / Гонконг / Тайвань (UTC+8)',
      tz: 'Asia/Singapore',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'kr_seoul',
      group: 'extra',
      badge: 'KR',
      optionLabel: '🇰🇷 Южная Корея — Сеул (UTC+9)',
      tz: 'Asia/Seoul',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    },
    {
      id: 'au_sydney',
      group: 'extra',
      badge: 'AU',
      optionLabel: '🇦🇺 Австралия — Сидней / Мельбурн',
      tz: 'Australia/Sydney',
      locale: 'en-US',
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9'
    }
  ];

  const LEGACY_PROFILE_ALIASES = {
    eu_central: 'de_berlin'
  };

  const PROFILES = Object.create(null);
  for (const item of PROFILE_LIST) {
    PROFILES[item.id] = item;
  }

  function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch (_) {
      return false;
    }
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

  // Cloudflare PoP (IATA airport code from /cdn-cgi/trace "colo=") -> exact IANA timezone
  const CF_COLO_TO_TZ = {
    // US East (UTC-5 / UTC-4)
    IAD: 'America/New_York', EWR: 'America/New_York', JFK: 'America/New_York', LGA: 'America/New_York',
    BOS: 'America/New_York', PHL: 'America/New_York', PIT: 'America/New_York', BUF: 'America/New_York',
    CLT: 'America/New_York', RDU: 'America/New_York', ATL: 'America/New_York', MIA: 'America/New_York',
    MCO: 'America/New_York', TPA: 'America/New_York', JAX: 'America/New_York', TLH: 'America/New_York',
    DTW: 'America/Detroit', IND: 'America/Indiana/Indianapolis', CMH: 'America/New_York',
    CLE: 'America/New_York', RIC: 'America/New_York', ORF: 'America/New_York', BWI: 'America/New_York',
    // US Central (UTC-6 / UTC-5)
    ORD: 'America/Chicago', DFW: 'America/Chicago', IAH: 'America/Chicago', AUS: 'America/Chicago',
    SAT: 'America/Chicago', MSP: 'America/Chicago', MCI: 'America/Chicago', STL: 'America/Chicago',
    MEM: 'America/Chicago', BNA: 'America/Chicago', OMA: 'America/Chicago', OKC: 'America/Chicago',
    MSY: 'America/Chicago', MKE: 'America/Chicago', DSM: 'America/Chicago', TUL: 'America/Chicago',
    MFE: 'America/Chicago', CRP: 'America/Chicago',
    // US Mountain & Arizona
    DEN: 'America/Denver', SLC: 'America/Denver', ABQ: 'America/Denver', BOI: 'America/Boise',
    PHX: 'America/Phoenix', TUS: 'America/Phoenix',
    // US West & Pacific
    LAX: 'America/Los_Angeles', SJC: 'America/Los_Angeles', SFO: 'America/Los_Angeles',
    SMF: 'America/Los_Angeles', SAN: 'America/Los_Angeles', LAS: 'America/Los_Angeles',
    SEA: 'America/Los_Angeles', PDX: 'America/Los_Angeles', GEG: 'America/Los_Angeles',
    FAT: 'America/Los_Angeles', ONT: 'America/Los_Angeles', BUR: 'America/Los_Angeles',
    ANC: 'America/Anchorage', HNL: 'Pacific/Honolulu',
    // Canada & Latin America
    YYZ: 'America/Toronto', YUL: 'America/Toronto', YOW: 'America/Toronto', YHZ: 'America/Halifax',
    YWG: 'America/Winnipeg', YYC: 'America/Edmonton', YEG: 'America/Edmonton', YVR: 'America/Vancouver',
    MEX: 'America/Mexico_City', QRO: 'America/Mexico_City', GDL: 'America/Mexico_City',
    GRU: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', BSB: 'America/Sao_Paulo',
    EZE: 'America/Argentina/Buenos_Aires', SCL: 'America/Santiago', BOG: 'America/Bogota', LIM: 'America/Lima',
    // UK, Ireland, Portugal
    LHR: 'Europe/London', MAN: 'Europe/London', EDI: 'Europe/London', BHX: 'Europe/London',
    DUB: 'Europe/Dublin', ORK: 'Europe/Dublin', LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon',
    // Western & Central Europe (CET)
    FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', BER: 'Europe/Berlin', DUS: 'Europe/Berlin',
    HAM: 'Europe/Berlin', STR: 'Europe/Berlin', NUE: 'Europe/Berlin', HAJ: 'Europe/Berlin',
    AMS: 'Europe/Amsterdam', EIN: 'Europe/Amsterdam',
    WAW: 'Europe/Warsaw', KRK: 'Europe/Warsaw', GDN: 'Europe/Warsaw',
    ARN: 'Europe/Stockholm', GOT: 'Europe/Stockholm', MMX: 'Europe/Stockholm',
    OSL: 'Europe/Oslo', CPH: 'Europe/Copenhagen',
    ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich',
    VIE: 'Europe/Vienna', PRG: 'Europe/Prague', BUD: 'Europe/Budapest', BTS: 'Europe/Bratislava',
    CDG: 'Europe/Paris', MRS: 'Europe/Paris', LYS: 'Europe/Paris', BOD: 'Europe/Paris',
    BRU: 'Europe/Brussels', LUX: 'Europe/Luxembourg',
    MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', VLC: 'Europe/Madrid',
    MXP: 'Europe/Rome', FCO: 'Europe/Rome', PMO: 'Europe/Rome',
    ZAG: 'Europe/Zagreb', BEG: 'Europe/Belgrade', LJU: 'Europe/Ljubljana', TIA: 'Europe/Tirane',
    // Northern & Eastern Europe (EET, UTC+2 / UTC+3)
    HEL: 'Europe/Helsinki', TLL: 'Europe/Tallinn', RIX: 'Europe/Riga', VNO: 'Europe/Vilnius',
    KBP: 'Europe/Kyiv',
    OTP: 'Europe/Bucharest', CLJ: 'Europe/Bucharest', SOF: 'Europe/Sofia',
    ATH: 'Europe/Athens', SKG: 'Europe/Athens', LCA: 'Asia/Nicosia', KIV: 'Europe/Chisinau',
    // Turkey, Middle East, Caucasus, Central Asia
    IST: 'Europe/Istanbul', SAW: 'Europe/Istanbul', ADB: 'Europe/Istanbul', ESB: 'Europe/Istanbul',
    TLV: 'Asia/Jerusalem', HFA: 'Asia/Jerusalem',
    DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', DOH: 'Asia/Qatar', BAH: 'Asia/Bahrain',
    KWI: 'Asia/Kuwait', MCT: 'Asia/Muscat', RUH: 'Asia/Riyadh', JED: 'Asia/Riyadh', AMM: 'Asia/Amman',
    TBS: 'Asia/Tbilisi', EVN: 'Asia/Yerevan', GYD: 'Asia/Baku',
    ALA: 'Asia/Almaty', NQZ: 'Asia/Almaty', TAS: 'Asia/Tashkent', FRU: 'Asia/Bishkek',
    // South, Southeast & East Asia, Oceania
    BOM: 'Asia/Kolkata', DEL: 'Asia/Kolkata', BLR: 'Asia/Kolkata', MAA: 'Asia/Kolkata',
    HYD: 'Asia/Kolkata', CCU: 'Asia/Kolkata',
    BKK: 'Asia/Bangkok', CNX: 'Asia/Bangkok', SGN: 'Asia/Ho_Chi_Minh', HAN: 'Asia/Ho_Chi_Minh',
    CGK: 'Asia/Jakarta', DPS: 'Asia/Makassar',
    SIN: 'Asia/Singapore', KUL: 'Asia/Kuala_Lumpur', MNL: 'Asia/Manila',
    HKG: 'Asia/Hong_Kong', MFM: 'Asia/Macau', TPE: 'Asia/Taipei', KHH: 'Asia/Taipei',
    NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', FUK: 'Asia/Tokyo', NGO: 'Asia/Tokyo',
    ICN: 'Asia/Seoul', GMP: 'Asia/Seoul',
    SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane',
    PER: 'Australia/Perth', ADL: 'Australia/Adelaide', AKL: 'Pacific/Auckland',
    // Russia / Belarus (for direct leak detection via CF colo if country missing)
    DME: 'Europe/Moscow', SVO: 'Europe/Moscow', VKO: 'Europe/Moscow', LED: 'Europe/Moscow',
    KZN: 'Europe/Moscow', ROV: 'Europe/Moscow', SVX: 'Asia/Yekaterinburg', OVB: 'Asia/Novosibirsk',
    KJA: 'Asia/Krasnoyarsk', KHV: 'Asia/Vladivostok', VVO: 'Asia/Vladivostok', MSQ: 'Europe/Minsk'
  };

  const COUNTRY_TO_PROFILE = {
    DE: 'de_berlin',
    NL: 'nl_amsterdam',
    BE: 'fr_paris',
    LU: 'fr_paris',
    FR: 'fr_paris',
    ES: 'fr_paris',
    IT: 'fr_paris',
    AT: 'at_vienna',
    CZ: 'at_vienna',
    HU: 'at_vienna',
    SK: 'at_vienna',
    SI: 'at_vienna',
    HR: 'at_vienna',
    RS: 'at_vienna',
    PL: 'pl_warsaw',
    SE: 'se_stockholm',
    NO: 'se_stockholm',
    DK: 'se_stockholm',
    CH: 'ch_zurich',
    LI: 'ch_zurich',
    FI: 'fi_helsinki',
    EE: 'fi_helsinki',
    LV: 'fi_helsinki',
    LT: 'fi_helsinki',
    UA: 'fi_helsinki',
    RO: 'ro_bucharest',
    BG: 'ro_bucharest',
    GR: 'ro_bucharest',
    CY: 'ro_bucharest',
    MD: 'ro_bucharest',
    TR: 'tr_istanbul',
    IL: 'il_jerusalem',
    AE: 'ae_dubai',
    GE: 'ae_dubai',
    AM: 'ae_dubai',
    AZ: 'ae_dubai',
    KZ: 'kz_almaty',
    UZ: 'kz_almaty',
    KG: 'kz_almaty',
    IN: 'in_kolkata',
    TH: 'th_bangkok',
    VN: 'th_bangkok',
    ID: 'th_bangkok',
    SG: 'sg_singapore',
    HK: 'sg_singapore',
    TW: 'sg_singapore',
    MY: 'sg_singapore',
    PH: 'sg_singapore',
    JP: 'jp_tokyo',
    KR: 'kr_seoul',
    AU: 'au_sydney',
    NZ: 'au_sydney',
    GB: 'uk_london',
    UK: 'uk_london',
    IE: 'uk_london',
    PT: 'pt_lisbon',
    IS: 'pt_lisbon',
    BR: 'br_saopaulo',
    AR: 'br_saopaulo',
    UY: 'br_saopaulo',
    CL: 'br_saopaulo'
  };

  const TZ_TO_PROFILE = {
    'America/New_York': 'us_east',
    'America/Detroit': 'us_east',
    'America/Indiana/Indianapolis': 'us_east',
    'America/Kentucky/Louisville': 'us_east',
    'America/Toronto': 'ca_toronto',
    'America/Montreal': 'ca_toronto',
    'America/Halifax': 'ca_toronto',
    'America/Chicago': 'us_central',
    'America/Winnipeg': 'us_central',
    'America/Mexico_City': 'us_central',
    'America/Menominee': 'us_central',
    'America/Bogota': 'us_east',
    'America/Lima': 'us_east',
    'America/Denver': 'us_mountain',
    'America/Boise': 'us_mountain',
    'America/Edmonton': 'us_mountain',
    'America/Phoenix': 'us_phoenix',
    'America/Los_Angeles': 'us_west',
    'America/Vancouver': 'us_west',
    'America/Tijuana': 'us_west',
    'America/Anchorage': 'us_west',
    'Pacific/Honolulu': 'us_west',
    'America/Sao_Paulo': 'br_saopaulo',
    'America/Argentina/Buenos_Aires': 'br_saopaulo',
    'America/Santiago': 'br_saopaulo',
    'Europe/Berlin': 'de_berlin',
    'Europe/Amsterdam': 'nl_amsterdam',
    'Europe/Brussels': 'fr_paris',
    'Europe/Luxembourg': 'fr_paris',
    'Europe/Paris': 'fr_paris',
    'Europe/Madrid': 'fr_paris',
    'Europe/Rome': 'fr_paris',
    'Europe/Vienna': 'at_vienna',
    'Europe/Prague': 'at_vienna',
    'Europe/Budapest': 'at_vienna',
    'Europe/Bratislava': 'at_vienna',
    'Europe/Zagreb': 'at_vienna',
    'Europe/Belgrade': 'at_vienna',
    'Europe/Ljubljana': 'at_vienna',
    'Europe/Warsaw': 'pl_warsaw',
    'Europe/Stockholm': 'se_stockholm',
    'Europe/Oslo': 'se_stockholm',
    'Europe/Copenhagen': 'se_stockholm',
    'Europe/Zurich': 'ch_zurich',
    'Europe/Helsinki': 'fi_helsinki',
    'Europe/Tallinn': 'fi_helsinki',
    'Europe/Riga': 'fi_helsinki',
    'Europe/Vilnius': 'fi_helsinki',
    'Europe/Kyiv': 'fi_helsinki',
    'Europe/Kiev': 'fi_helsinki',
    'Europe/Bucharest': 'ro_bucharest',
    'Europe/Sofia': 'ro_bucharest',
    'Europe/Athens': 'ro_bucharest',
    'Europe/Chisinau': 'ro_bucharest',
    'Asia/Nicosia': 'ro_bucharest',
    'Europe/Istanbul': 'tr_istanbul',
    'Asia/Istanbul': 'tr_istanbul',
    'Europe/London': 'uk_london',
    'Europe/Dublin': 'uk_london',
    'Europe/Lisbon': 'pt_lisbon',
    'Atlantic/Reykjavik': 'pt_lisbon',
    'Asia/Jerusalem': 'il_jerusalem',
    'Asia/Tel_Aviv': 'il_jerusalem',
    'Asia/Dubai': 'ae_dubai',
    'Asia/Muscat': 'ae_dubai',
    'Asia/Tbilisi': 'ae_dubai',
    'Asia/Yerevan': 'ae_dubai',
    'Asia/Baku': 'ae_dubai',
    'Asia/Qatar': 'tr_istanbul',
    'Asia/Riyadh': 'tr_istanbul',
    'Asia/Kuwait': 'tr_istanbul',
    'Asia/Bahrain': 'tr_istanbul',
    'Asia/Amman': 'tr_istanbul',
    'Asia/Almaty': 'kz_almaty',
    'Asia/Qyzylorda': 'kz_almaty',
    'Asia/Aqtobe': 'kz_almaty',
    'Asia/Tashkent': 'kz_almaty',
    'Asia/Bishkek': 'ae_dubai',
    'Asia/Kolkata': 'in_kolkata',
    'Asia/Calcutta': 'in_kolkata',
    'Asia/Colombo': 'in_kolkata',
    'Asia/Bangkok': 'th_bangkok',
    'Asia/Ho_Chi_Minh': 'th_bangkok',
    'Asia/Saigon': 'th_bangkok',
    'Asia/Jakarta': 'th_bangkok',
    'Asia/Singapore': 'sg_singapore',
    'Asia/Kuala_Lumpur': 'sg_singapore',
    'Asia/Hong_Kong': 'sg_singapore',
    'Asia/Macau': 'sg_singapore',
    'Asia/Taipei': 'sg_singapore',
    'Asia/Manila': 'sg_singapore',
    'Australia/Perth': 'sg_singapore',
    'Asia/Tokyo': 'jp_tokyo',
    'Asia/Seoul': 'kr_seoul',
    'Australia/Sydney': 'au_sydney',
    'Australia/Melbourne': 'au_sydney',
    'Australia/Brisbane': 'au_sydney',
    'Pacific/Auckland': 'au_sydney'
  };

  function getTzOffsetMinutesNow(tz) {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
      }).formatToParts(now);
      const tzn = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
      if (tzn === 'GMT' || tzn === 'UTC') return 0;
      const m = /^GMT([+-])(\d{2}):(\d{2})/.exec(tzn);
      if (!m) return 0;
      const sign = m[1] === '+' ? 1 : -1;
      return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
    } catch (_) {
      return null;
    }
  }

  function findClosestProfileByOffset(tz) {
    const targetOff = getTzOffsetMinutesNow(tz);
    if (targetOff === null) return null;
    let bestId = null;
    let bestDiff = Infinity;
    for (const p of PROFILE_LIST) {
      const off = getTzOffsetMinutesNow(p.tz);
      if (off === null) continue;
      const diff = Math.abs(off - targetOff);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestId = p.id;
        if (diff === 0) break;
      }
    }
    return bestId;
  }

  function isDirectExposure(countryCode, timezone) {
    const cc = String(countryCode || '').trim().toUpperCase();
    const tz = String(timezone || '').trim();
    if (cc === 'RU' || cc === 'BY') return true;
    if (tz && DIRECT_EXPOSED_TIMEZONES.has(tz)) return true;
    return false;
  }

  function getTzFromCfColo(colo) {
    const code = String(colo || '').trim().toUpperCase();
    return code && CF_COLO_TO_TZ[code] ? CF_COLO_TO_TZ[code] : '';
  }

  function matchProfileFromGeo(countryCode, timezone) {
    const cc = String(countryCode || '').trim().toUpperCase();
    const tz = String(timezone || '').trim();

    if (!cc && !tz) {
      return { profileId: null, exactTz: '', exposed: false };
    }

    if (isDirectExposure(cc, tz)) {
      return { profileId: null, exactTz: tz, exposed: true };
    }

    const validTz = isValidTimeZone(tz) ? tz : '';

    if (validTz && TZ_TO_PROFILE[validTz]) {
      return { profileId: TZ_TO_PROFILE[validTz], exactTz: validTz, exposed: false };
    }

    if (validTz) {
      if (validTz.startsWith('America/Indiana/') || validTz.startsWith('America/Kentucky/')) {
        return { profileId: 'us_east', exactTz: validTz, exposed: false };
      }
      if (validTz.startsWith('America/North_Dakota/')) {
        return { profileId: 'us_central', exactTz: validTz, exposed: false };
      }
      const byOffset = findClosestProfileByOffset(validTz);
      if (byOffset) {
        return { profileId: byOffset, exactTz: validTz, exposed: false };
      }
    }

    if (cc && COUNTRY_TO_PROFILE[cc]) {
      const pid = COUNTRY_TO_PROFILE[cc];
      return { profileId: pid, exactTz: PROFILES[pid].tz, exposed: false };
    }

    if (cc === 'US') {
      return { profileId: 'us_east', exactTz: 'America/New_York', exposed: false };
    }
    if (cc === 'CA') {
      return { profileId: 'ca_toronto', exactTz: 'America/Toronto', exposed: false };
    }

    return { profileId: 'de_berlin', exactTz: validTz || 'Europe/Berlin', exposed: false };
  }

  // Combines JSON GeoIP response and Cloudflare /cdn-cgi/trace so US centroid bugs
  // (e.g. MaxMind GeoLite2 returning America/Chicago for East Coast IPs) never mismatch Cloudflare.
  function resolveGeoConsensus(jsonGeo, cfTrace) {
    const g = jsonGeo || null;
    const cf = cfTrace || null;
    if (!g && !cf) return null;

    const cfColo = String(cf?.colo || '').trim().toUpperCase();
    const cfCountry = String(cf?.countryCode || '').trim().toUpperCase();
    const cfIp = String(cf?.ip || '').trim();
    const cfTz = getTzFromCfColo(cfColo);

    const geoIp = String(g?.ip || '').trim();
    const geoCountry = String(g?.countryCode || '').trim().toUpperCase();
    const geoCity = String(g?.city || '').trim();
    const geoTz = String(g?.timezone || '').trim();
    const geoLowAcc = Boolean(g?.lowAccuracy);

    // Exposure check: if EITHER Cloudflare OR GeoIP sees RU/BY, trigger RU! alert immediately
    if (isDirectExposure(cfCountry, cfTz) || isDirectExposure(geoCountry, geoTz)) {
      const expCc = isDirectExposure(cfCountry, cfTz) ? (cfCountry || geoCountry) : (geoCountry || cfCountry);
      const expTz = isDirectExposure(cfCountry, cfTz) ? (cfTz || geoTz) : (geoTz || cfTz);
      return {
        ip: cfIp || geoIp,
        countryCode: expCc,
        city: geoCity,
        timezone: expTz,
        colo: cfColo,
        splitIp: Boolean(cfIp && geoIp && cfIp !== geoIp),
        exposed: true,
        matchedProfileId: ''
      };
    }

    const splitIp = Boolean(cfIp && geoIp && cfIp !== geoIp);
    const effectiveCountry = cfCountry || geoCountry;
    let effectiveTz = '';

    if (splitIp && cfTz) {
      // Proxy routes Cloudflare via a different outbound node than GeoIP API -> align with Cloudflare!
      effectiveTz = cfTz;
    } else if (cfTz && (geoLowAcc || !geoTz || !isValidTimeZone(geoTz))) {
      // GeoIP fell back to country centroid (e.g. MaxMind Kansas America/Chicago without city) -> trust CF PoP!
      effectiveTz = cfTz;
    } else if (
      cfTz &&
      effectiveCountry === 'US' &&
      !geoCity &&
      geoTz === 'America/Chicago' &&
      cfTz !== 'America/Chicago'
    ) {
      effectiveTz = cfTz;
    } else if (isValidTimeZone(geoTz)) {
      effectiveTz = geoTz;
    } else if (cfTz) {
      effectiveTz = cfTz;
    }

    const match = matchProfileFromGeo(effectiveCountry, effectiveTz);
    return {
      ip: cfIp || geoIp,
      countryCode: effectiveCountry,
      city: splitIp ? '' : geoCity,
      timezone: match.exactTz || effectiveTz,
      colo: cfColo,
      splitIp,
      exposed: Boolean(match.exposed),
      matchedProfileId: match.profileId || ''
    };
  }

  const DEFAULT_VPN_STATUS = {
    ip: '',
    countryCode: '',
    city: '',
    timezone: '',
    colo: '',
    splitIp: false,
    matchedProfileId: '',
    exposed: false,
    checkedAt: 0,
    error: ''
  };

  root.TZ_PROFILES_DATA = {
    PROFILE_GROUPS,
    PROFILE_LIST,
    PROFILES,
    CF_COLO_TO_TZ,
    DEFAULT_STATE: {
      enabled: true,
      profileId: 'us_east',
      autoVpn: true,
      leakAlert: true,
      spoofLang: true,
      cdpMode: false,
      excludedSites: []
    },
    DEFAULT_VPN_STATUS,
    isValidTimeZone,
    resolveProfileId,
    getProfile,
    getTzFromCfColo,
    isDirectExposure,
    matchProfileFromGeo,
    resolveGeoConsensus
  };
})(globalThis);
