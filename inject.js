(() => {
  'use strict';

  const cfg = window.__TZ_LOCALE_CFG__;
  try {
    delete window.__TZ_LOCALE_CFG__;
  } catch (_) {}

  if (!cfg || !cfg.tz) return;

  const TARGET_TZ = cfg.tz;
  const TARGET_LOCALE = cfg.locale || 'en-US';
  const TARGET_LANGUAGES = Object.freeze((cfg.languages || ['en-US', 'en']).slice());
  const SPOOF_LANG = Boolean(cfg.spoofLang);

  // Save untouched native constructors & methods in closure BEFORE patching
  const OrigDate = window.Date;
  const OrigDateParse = OrigDate.parse;
  const OrigDateUTC = OrigDate.UTC;
  const OrigDateNow = OrigDate.now;
  const proto = OrigDate.prototype;
  const origGetTime = proto.getTime;
  const origSetTime = proto.setTime;
  const origSetUTCFullYear = proto.setUTCFullYear;
  const origGetFullYear = proto.getFullYear;
  const origGetMonth = proto.getMonth;
  const origGetDate = proto.getDate;
  const origGetHours = proto.getHours;
  const origGetMinutes = proto.getMinutes;
  const origGetSeconds = proto.getSeconds;
  const origGetMilliseconds = proto.getMilliseconds;
  const origToLocaleString = proto.toLocaleString;
  const origToLocaleDateString = proto.toLocaleDateString;
  const origToLocaleTimeString = proto.toLocaleTimeString;

  const OrigDTF = Intl.DateTimeFormat;
  const OrigFnToString = Function.prototype.toString;
  const defineProp = Object.defineProperty;
  const getOwnPropDesc = Object.getOwnPropertyDescriptor;

  // Registry to mask wrapped functions as [native code]
  const nativeSourceMap = new WeakMap();
  const markNative = (fn, name) => {
    if (typeof fn === 'function') {
      const label = name !== undefined ? name : (fn.name || '');
      nativeSourceMap.set(fn, `function ${label}() { [native code] }`);
    }
    return fn;
  };

  const patchedToString = function toString() {
    if (nativeSourceMap.has(this)) {
      return nativeSourceMap.get(this);
    }
    return OrigFnToString.call(this);
  };
  markNative(patchedToString, 'toString');
  defineProp(Function.prototype, 'toString', {
    value: patchedToString,
    writable: true,
    configurable: true
  });

  // Pre-create formatters using untouched OrigDTF to calculate exact target timezone parts & DST
  const partsFmt = new OrigDTF('en-US', {
    timeZone: TARGET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const longTzFmt = new OrigDTF('en-US', {
    timeZone: TARGET_TZ,
    timeZoneName: 'long'
  });

  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fullYearUtcMs(fullYear, month, day = 1, hour = 0, minute = 0, second = 0, ms = 0) {
    const yr = +fullYear;
    if (Number.isNaN(yr)) return NaN;
    if (yr >= 0 && yr <= 99) {
      const tmp = new OrigDate(OrigDateUTC(2000, +month, +day, +hour, +minute, +second, +ms));
      if (Number.isNaN(origGetTime.call(tmp))) return NaN;
      return origSetUTCFullYear.call(tmp, yr);
    }
    return OrigDateUTC(yr, +month, +day, +hour, +minute, +second, +ms);
  }

  function getTargetParts(epochMs) {
    if (Number.isNaN(epochMs) || !Number.isFinite(epochMs)) return null;
    const d = new OrigDate(epochMs);
    const parts = partsFmt.formatToParts(d);
    let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0, weekdayStr = 'Sun';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      switch (p.type) {
        case 'year':
          year = p.value === '0' ? 0 : +p.value;
          break;
        case 'month': month = (+p.value) - 1; break;
        case 'day': day = +p.value; break;
        case 'hour': hour = (+p.value) % 24; break;
        case 'minute': minute = +p.value; break;
        case 'second': second = +p.value; break;
        case 'weekday': weekdayStr = p.value; break;
      }
    }
    // Handle BC years where Intl en-US numeric year returns positive number without sign
    const realUtcYear = origGetFullYear.call(d);
    if (realUtcYear <= 0 && year > 0 && realUtcYear < -1) {
      year = 1 - year;
    }
    const ms = ((epochMs % 1000) + 1000) % 1000;
    const asUtcMs = fullYearUtcMs(year, month, day, hour, minute, second, ms);
    const offsetMin = Math.round((epochMs - asUtcMs) / 60000);
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      ms,
      weekday: WEEKDAYS[weekdayStr] ?? 0,
      weekdayStr,
      offsetMin
    };
  }

  function getLongTzName(epochMs) {
    try {
      const parts = longTzFmt.formatToParts(new OrigDate(epochMs));
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
    } catch (_) {}
    return TARGET_TZ;
  }

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const pad4 = (n) => {
    const s = '' + Math.abs(n);
    return (n < 0 ? '-' : '') + s.padStart(4, '0');
  };

  function formatGmtOffset(offsetMin) {
    const sign = offsetMin <= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const hh = pad2(Math.floor(abs / 60));
    const mm = pad2(abs % 60);
    return `GMT${sign}${hh}${mm}`;
  }

  function formatDateString(epochMs) {
    const p = getTargetParts(epochMs);
    if (!p) return 'Invalid Date';
    return `${p.weekdayStr} ${MONTHS[p.month]} ${pad2(p.day)} ${pad4(p.year)}`;
  }

  function formatTimeString(epochMs) {
    const p = getTargetParts(epochMs);
    if (!p) return 'Invalid Date';
    const gmt = formatGmtOffset(p.offsetMin);
    const tzName = getLongTzName(epochMs);
    return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ${gmt} (${tzName})`;
  }

  function formatFullString(epochMs) {
    const p = getTargetParts(epochMs);
    if (!p) return 'Invalid Date';
    return `${formatDateString(epochMs)} ${formatTimeString(epochMs)}`;
  }

  function localComponentsToEpoch(fullYear, month, day = 1, hour = 0, minute = 0, second = 0, ms = 0) {
    const guessUtc = fullYearUtcMs(fullYear, month, day, hour, minute, second, ms);
    if (Number.isNaN(guessUtc)) return NaN;
    const p1 = getTargetParts(guessUtc);
    if (!p1) return NaN;
    const adjusted = guessUtc + p1.offsetMin * 60000;
    const p2 = getTargetParts(adjusted);
    if (p2 && p2.offsetMin !== p1.offsetMin) {
      return guessUtc + p2.offsetMin * 60000;
    }
    return adjusted;
  }

  // ECMAScript ISO date-only strings (e.g. "2026", "2026-11", "2026-11-27") are always UTC
  const ISO_DATE_ONLY_RE = /^(?:\d{4}|[+-]\d{6})(?:-\d{2}(?:-\d{2})?)?$/;
  // Local ISO date+time without Z or offset (supports fractional seconds of any length)
  const ISO_LOCAL_DT_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

  function hasExplicitTimezone(s) {
    if (/\d\s*[Zz]$/.test(s)) return true;
    if (/\b(?:GMT|UTC|UT|[ECMP][SD]T)\b/i.test(s)) return true;
    if (/\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*[+-]\d{2}(?::?\d{2})?(?:\s*\([^)]*\))?$/.test(s)) return true;
    if (/\s[+-]\d{4}(?:\b|$)/.test(s)) return true;
    return false;
  }

  function parseInTargetTz(str) {
    if (typeof str !== 'string') {
      return OrigDateParse(str);
    }
    const trimmed = str.trim();
    if (!trimmed) return NaN;

    if (ISO_DATE_ONLY_RE.test(trimmed)) {
      return OrigDateParse(trimmed);
    }

    const m = ISO_LOCAL_DT_RE.exec(trimmed);
    if (m) {
      const yr = +m[1];
      const mo = (+m[2]) - 1;
      const dy = +m[3];
      const hr = +m[4];
      const mn = +m[5];
      const sc = m[6] ? +m[6] : 0;
      const ms = m[7] ? +(m[7].slice(0, 3).padEnd(3, '0')) : 0;
      return localComponentsToEpoch(yr, mo, dy, hr, mn, sc, ms);
    }

    if (hasExplicitTimezone(trimmed)) {
      return OrigDateParse(trimmed);
    }

    // Non-ISO local string (e.g. "11/27/2026", "Nov 27, 2026 14:30"):
    // Let V8 parse calendar components in OS local time, then re-anchor them to TARGET_TZ.
    const osEpoch = OrigDateParse(trimmed);
    if (Number.isNaN(osEpoch)) return NaN;
    const osDate = new OrigDate(osEpoch);
    return localComponentsToEpoch(
      origGetFullYear.call(osDate),
      origGetMonth.call(osDate),
      origGetDate.call(osDate),
      origGetHours.call(osDate),
      origGetMinutes.call(osDate),
      origGetSeconds.call(osDate),
      origGetMilliseconds.call(osDate)
    );
  }

  function patchProtoMethod(targetProto, name, fn) {
    markNative(fn, name);
    defineProp(targetProto, name, {
      value: fn,
      writable: true,
      configurable: true
    });
  }

  patchProtoMethod(proto, 'getTimezoneOffset', function getTimezoneOffset() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.offsetMin : NaN;
  });

  patchProtoMethod(proto, 'getFullYear', function getFullYear() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.year : NaN;
  });

  patchProtoMethod(proto, 'getYear', function getYear() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.year - 1900 : NaN;
  });

  patchProtoMethod(proto, 'getMonth', function getMonth() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.month : NaN;
  });

  patchProtoMethod(proto, 'getDate', function getDate() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.day : NaN;
  });

  patchProtoMethod(proto, 'getDay', function getDay() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.weekday : NaN;
  });

  patchProtoMethod(proto, 'getHours', function getHours() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.hour : NaN;
  });

  patchProtoMethod(proto, 'getMinutes', function getMinutes() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.minute : NaN;
  });

  patchProtoMethod(proto, 'getSeconds', function getSeconds() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.second : NaN;
  });

  patchProtoMethod(proto, 'toString', function toString() {
    return formatFullString(origGetTime.call(this));
  });

  patchProtoMethod(proto, 'toDateString', function toDateString() {
    return formatDateString(origGetTime.call(this));
  });

  patchProtoMethod(proto, 'toTimeString', function toTimeString() {
    return formatTimeString(origGetTime.call(this));
  });

  function withTzOptions(options) {
    const opts = options ? Object.assign({}, options) : {};
    if (!opts.timeZone) opts.timeZone = TARGET_TZ;
    return opts;
  }

  function resolveLocaleArg(locales) {
    if (!SPOOF_LANG) return locales;
    if (locales === undefined) return TARGET_LOCALE;
    if (Array.isArray(locales) && locales.length === 0) return TARGET_LOCALE;
    return locales;
  }

  patchProtoMethod(proto, 'toLocaleString', function toLocaleString(locales, options) {
    return origToLocaleString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  patchProtoMethod(proto, 'toLocaleDateString', function toLocaleDateString(locales, options) {
    return origToLocaleDateString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  patchProtoMethod(proto, 'toLocaleTimeString', function toLocaleTimeString(locales, options) {
    return origToLocaleTimeString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  patchProtoMethod(proto, 'setHours', function setHours(h, m, s, ms) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year,
      p.month,
      p.day,
      +h,
      arguments.length > 1 ? +m : p.minute,
      arguments.length > 2 ? +s : p.second,
      arguments.length > 3 ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setMinutes', function setMinutes(m, s, ms) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year, p.month, p.day, p.hour,
      +m,
      arguments.length > 1 ? +s : p.second,
      arguments.length > 2 ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setSeconds', function setSeconds(s, ms) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year, p.month, p.day, p.hour, p.minute,
      +s,
      arguments.length > 1 ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setDate', function setDate(d) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(p.year, p.month, +d, p.hour, p.minute, p.second, p.ms);
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setMonth', function setMonth(mo, d) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year,
      +mo,
      arguments.length > 1 ? +d : p.day,
      p.hour, p.minute, p.second, p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setFullYear', function setFullYear(y, mo, d) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const cur = origGetTime.call(this);
    const p = getTargetParts(Number.isNaN(cur) ? 0 : cur);
    if (!p) return origSetTime.call(this, NaN);
    const epoch = localComponentsToEpoch(
      +y,
      arguments.length > 1 ? +mo : p.month,
      arguments.length > 2 ? +d : p.day,
      p.hour, p.minute, p.second, p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod(proto, 'setYear', function setYear(y) {
    if (arguments.length === 0) return origSetTime.call(this, NaN);
    const numY = +y;
    if (Number.isNaN(numY)) return origSetTime.call(this, NaN);
    const cur = origGetTime.call(this);
    const p = getTargetParts(Number.isNaN(cur) ? 0 : cur);
    if (!p) return origSetTime.call(this, NaN);
    const truncY = Math.trunc(numY);
    const fullY = (truncY >= 0 && truncY <= 99) ? 1900 + truncY : truncY;
    const epoch = localComponentsToEpoch(fullY, p.month, p.day, p.hour, p.minute, p.second, p.ms);
    return origSetTime.call(this, epoch);
  });

  const DateProxy = new Proxy(OrigDate, {
    apply(_target, _thisArg, _args) {
      return formatFullString(OrigDateNow());
    },
    construct(target, args, newTarget) {
      if (args.length === 0) {
        return Reflect.construct(target, [OrigDateNow()], newTarget);
      }
      if (args.length === 1) {
        const arg0 = args[0];
        if (typeof arg0 === 'string') {
          return Reflect.construct(target, [parseInTargetTz(arg0)], newTarget);
        }
        return Reflect.construct(target, [arg0], newTarget);
      }
      const [y, mo, d = 1, h = 0, mn = 0, s = 0, ms = 0] = args;
      let fullY = +y;
      if (!Number.isNaN(fullY)) {
        const truncY = Math.trunc(fullY);
        if (truncY >= 0 && truncY <= 99) fullY = 1900 + truncY;
      }
      const epoch = localComponentsToEpoch(fullY, mo, d, h, mn, s, ms);
      return Reflect.construct(target, [epoch], newTarget);
    }
  });

  markNative(DateProxy, 'Date');
  const parseWrapper = function parse(str) {
    return parseInTargetTz(str);
  };
  markNative(parseWrapper, 'parse');
  defineProp(DateProxy, 'parse', { value: parseWrapper, writable: true, configurable: true });
  defineProp(proto, 'constructor', { value: DateProxy, writable: true, configurable: true });
  defineProp(window, 'Date', { value: DateProxy, writable: true, configurable: true });

  // Wrap Intl.DateTimeFormat (preserving explicit caller locales while defaulting to TARGET_LOCALE & TARGET_TZ)
  const DTFProxy = new Proxy(OrigDTF, {
    apply(target, _thisArg, args) {
      const [locales, options] = args;
      return Reflect.construct(target, [resolveLocaleArg(locales), withTzOptions(options)]);
    },
    construct(target, args, newTarget) {
      const [locales, options] = args;
      return Reflect.construct(target, [resolveLocaleArg(locales), withTzOptions(options)], newTarget);
    }
  });
  markNative(DTFProxy, 'DateTimeFormat');
  defineProp(OrigDTF.prototype, 'constructor', { value: DTFProxy, writable: true, configurable: true });
  defineProp(Intl, 'DateTimeFormat', { value: DTFProxy, writable: true, configurable: true });

  // Patch TC39 Temporal API (Temporal.Now & Temporal.Instant) so modern Chrome does not leak OS timezone
  if (typeof Temporal !== 'undefined' && Temporal && Temporal.Now) {
    const tNow = Temporal.Now;
    if (typeof tNow.timeZoneId === 'function') {
      const tzIdFn = function timeZoneId() {
        return TARGET_TZ;
      };
      markNative(tzIdFn, 'timeZoneId');
      defineProp(tNow, 'timeZoneId', { value: tzIdFn, writable: true, configurable: true });
    }

    for (const methodName of ['zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO']) {
      const origMethod = tNow[methodName];
      if (typeof origMethod === 'function') {
        const wrapped = function () {
          const tzArg = arguments[0] === undefined ? TARGET_TZ : arguments[0];
          return origMethod.call(this, tzArg);
        };
        defineProp(wrapped, 'name', { value: methodName, configurable: true });
        markNative(wrapped, methodName);
        defineProp(tNow, methodName, { value: wrapped, writable: true, configurable: true });
      }
    }

    if (Temporal.Instant && Temporal.Instant.prototype && typeof Temporal.Instant.prototype.toLocaleString === 'function') {
      const origInstTls = Temporal.Instant.prototype.toLocaleString;
      patchProtoMethod(Temporal.Instant.prototype, 'toLocaleString', function toLocaleString(locales, options) {
        return origInstTls.call(this, resolveLocaleArg(locales), withTzOptions(options));
      });
    }
  }

  // Language & Locale overrides (Navigator + Intl formatters + Number/String/Temporal + SpeechSynthesis voices)
  if (SPOOF_LANG) {
    const wrapIntlCtor = (name) => {
      const OrigCtor = Intl[name];
      if (typeof OrigCtor !== 'function') return;
      const p = new Proxy(OrigCtor, {
        apply(target, _thisArg, args) {
          const [locales, options] = args;
          return Reflect.construct(target, [resolveLocaleArg(locales), options]);
        },
        construct(target, args, newTarget) {
          const [locales, options] = args;
          return Reflect.construct(target, [resolveLocaleArg(locales), options], newTarget);
        }
      });
      markNative(p, name);
      if (OrigCtor.prototype) {
        defineProp(OrigCtor.prototype, 'constructor', { value: p, writable: true, configurable: true });
      }
      defineProp(Intl, name, { value: p, writable: true, configurable: true });
    };

    for (const ctorName of [
      'NumberFormat',
      'PluralRules',
      'RelativeTimeFormat',
      'Collator',
      'ListFormat',
      'DisplayNames',
      'Segmenter',
      'DurationFormat'
    ]) {
      wrapIntlCtor(ctorName);
    }

    // V8 Number/BigInt/String locale methods use internal C++ intrinsics directly, so patch them explicitly
    if (Number.prototype && typeof Number.prototype.toLocaleString === 'function') {
      const origNumTls = Number.prototype.toLocaleString;
      patchProtoMethod(Number.prototype, 'toLocaleString', function toLocaleString(locales, options) {
        return origNumTls.call(this, resolveLocaleArg(locales), options);
      });
    }

    if (typeof BigInt !== 'undefined' && BigInt.prototype && typeof BigInt.prototype.toLocaleString === 'function') {
      const origBigTls = BigInt.prototype.toLocaleString;
      patchProtoMethod(BigInt.prototype, 'toLocaleString', function toLocaleString(locales, options) {
        return origBigTls.call(this, resolveLocaleArg(locales), options);
      });
    }

    if (String.prototype && typeof String.prototype.localeCompare === 'function') {
      const origLocaleCompare = String.prototype.localeCompare;
      patchProtoMethod(String.prototype, 'localeCompare', function localeCompare(that, locales, options) {
        return origLocaleCompare.call(this, that, resolveLocaleArg(locales), options);
      });
    }

    if (typeof Temporal !== 'undefined' && Temporal) {
      for (const typeName of [
        'PlainDate',
        'PlainTime',
        'PlainDateTime',
        'ZonedDateTime',
        'PlainYearMonth',
        'PlainMonthDay',
        'Duration'
      ]) {
        const ctor = Temporal[typeName];
        if (ctor && ctor.prototype && typeof ctor.prototype.toLocaleString === 'function') {
          const origTls = ctor.prototype.toLocaleString;
          patchProtoMethod(ctor.prototype, 'toLocaleString', function toLocaleString(locales, options) {
            return origTls.call(this, resolveLocaleArg(locales), options);
          });
        }
      }
    }

    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      const getLang = function language() { return TARGET_LOCALE; };
      const getLangs = function languages() { return TARGET_LANGUAGES; };
      markNative(getLang, 'get language');
      markNative(getLangs, 'get languages');

      const langDesc = getOwnPropDesc(Navigator.prototype, 'language');
      if (!langDesc || langDesc.configurable) {
        defineProp(Navigator.prototype, 'language', {
          get: getLang,
          enumerable: true,
          configurable: true
        });
      }
      const langsDesc = getOwnPropDesc(Navigator.prototype, 'languages');
      if (!langsDesc || langsDesc.configurable) {
        defineProp(Navigator.prototype, 'languages', {
          get: getLangs,
          enumerable: true,
          configurable: true
        });
      }
    }

    // Patch Web Speech API (speechSynthesis.getVoices) so Russian OS voices (e.g. Microsoft Irina/Pavel)
    // do not leak the underlying Windows language pack, while preserving genuine SpeechSynthesisVoice instances.
    if (
      typeof SpeechSynthesis !== 'undefined' &&
      SpeechSynthesis.prototype &&
      typeof SpeechSynthesisVoice !== 'undefined' &&
      SpeechSynthesisVoice.prototype
    ) {
      const ssvProto = SpeechSynthesisVoice.prototype;
      const origNameGet = getOwnPropDesc(ssvProto, 'name')?.get;
      const origUriGet = getOwnPropDesc(ssvProto, 'voiceURI')?.get;
      const origLangGet = getOwnPropDesc(ssvProto, 'lang')?.get;
      const origDefaultGet = getOwnPropDesc(ssvProto, 'default')?.get;
      const origLocalGet = getOwnPropDesc(ssvProto, 'localService')?.get;
      const origGetVoices = SpeechSynthesis.prototype.getVoices;

      if (origNameGet && origUriGet && origLangGet && origDefaultGet && origLocalGet && origGetVoices) {
        const voiceOverrides = new WeakMap();
        const FALLBACK_SYSTEM_VOICES = TARGET_LOCALE === 'en-GB'
          ? [
              {
                name: 'Microsoft Hazel - English (United Kingdom)',
                voiceURI: 'Microsoft Hazel - English (United Kingdom)',
                lang: 'en-GB',
                default: true
              },
              {
                name: 'Microsoft Susan - English (United Kingdom)',
                voiceURI: 'Microsoft Susan - English (United Kingdom)',
                lang: 'en-GB',
                default: false
              },
              {
                name: 'Microsoft George - English (United Kingdom)',
                voiceURI: 'Microsoft George - English (United Kingdom)',
                lang: 'en-GB',
                default: false
              }
            ]
          : [
              {
                name: 'Microsoft David - English (United States)',
                voiceURI: 'Microsoft David - English (United States)',
                lang: 'en-US',
                default: true
              },
              {
                name: 'Microsoft Mark - English (United States)',
                voiceURI: 'Microsoft Mark - English (United States)',
                lang: 'en-US',
                default: false
              },
              {
                name: 'Microsoft Zira - English (United States)',
                voiceURI: 'Microsoft Zira - English (United States)',
                lang: 'en-US',
                default: false
              }
            ];

        const patchVoiceGetter = (prop, origGetter) => {
          const getter = function () {
            const ov = voiceOverrides.get(this);
            if (ov && prop in ov) return ov[prop];
            return origGetter.call(this);
          };
          markNative(getter, `get ${prop}`);
          defineProp(ssvProto, prop, {
            get: getter,
            enumerable: true,
            configurable: true
          });
        };

        patchVoiceGetter('name', origNameGet);
        patchVoiceGetter('voiceURI', origUriGet);
        patchVoiceGetter('lang', origLangGet);
        patchVoiceGetter('default', origDefaultGet);

        const patchedGetVoices = function getVoices() {
          const rawVoices = origGetVoices.call(this);
          if (!Array.isArray(rawVoices) || rawVoices.length === 0) return rawVoices;

          const result = [];
          let hasNativeEnLocal = false;

          for (let i = 0; i < rawVoices.length; i++) {
            const v = rawVoices[i];
            const vLang = (origLangGet.call(v) || '').toLowerCase();
            const isLocal = Boolean(origLocalGet.call(v));
            if (isLocal && vLang.startsWith('en')) {
              hasNativeEnLocal = true;
            }
          }

          let mappedLocalIdx = 0;
          let defaultAssigned = false;

          for (let i = 0; i < rawVoices.length; i++) {
            const v = rawVoices[i];
            const vLang = (origLangGet.call(v) || '').toLowerCase();
            const isLocal = Boolean(origLocalGet.call(v));

            if (isLocal) {
              if (vLang.startsWith('en')) {
                const isDef = !defaultAssigned;
                defaultAssigned = true;
                voiceOverrides.set(v, { default: isDef });
                result.push(v);
              } else if (!hasNativeEnLocal && mappedLocalIdx < FALLBACK_SYSTEM_VOICES.length) {
                const tpl = FALLBACK_SYSTEM_VOICES[mappedLocalIdx++];
                const isDef = !defaultAssigned && tpl.default;
                if (isDef) defaultAssigned = true;
                voiceOverrides.set(v, {
                  name: tpl.name,
                  voiceURI: tpl.voiceURI,
                  lang: tpl.lang,
                  default: isDef
                });
                result.push(v);
              }
              // Drop any remaining non-English local OS voices (e.g. extra ru-RU voices)
            } else {
              // Keep remote browser voices (Google voices), ensuring none of them claims default if local exists
              if (origDefaultGet.call(v) && defaultAssigned) {
                voiceOverrides.set(v, { default: false });
              }
              result.push(v);
            }
          }

          return result;
        };

        markNative(patchedGetVoices, 'getVoices');
        defineProp(SpeechSynthesis.prototype, 'getVoices', {
          value: patchedGetVoices,
          writable: true,
          configurable: true
        });
      }
    }
  }
})();
