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

  // Save untouched native constructors & methods in closure
  const OrigDate = window.Date;
  const OrigDateParse = OrigDate.parse;
  const OrigDateUTC = OrigDate.UTC;
  const OrigDateNow = OrigDate.now;
  const OrigDTF = Intl.DateTimeFormat;
  const OrigNF = Intl.NumberFormat;
  const OrigPR = Intl.PluralRules;
  const OrigRTF = Intl.RelativeTimeFormat;
  const OrigCollator = Intl.Collator;
  const OrigListFormat = Intl.ListFormat;
  const OrigFnToString = Function.prototype.toString;
  const defineProp = Object.defineProperty;
  const getOwnPropDesc = Object.getOwnPropertyDescriptor;

  // Registry to mask wrapped functions as [native code]
  const nativeSourceMap = new WeakMap();
  const markNative = (fn, name) => {
    if (typeof fn === 'function') {
      nativeSourceMap.set(fn, `function ${name || fn.name || ''}() { [native code] }`);
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

  function getTargetParts(epochMs) {
    if (Number.isNaN(epochMs)) return null;
    const d = new OrigDate(epochMs);
    const parts = partsFmt.formatToParts(d);
    let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0, weekdayStr = 'Sun';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      switch (p.type) {
        case 'year': year = +p.value; break;
        case 'month': month = (+p.value) - 1; break;
        case 'day': day = +p.value; break;
        case 'hour': hour = (+p.value) % 24; break;
        case 'minute': minute = +p.value; break;
        case 'second': second = +p.value; break;
        case 'weekday': weekdayStr = p.value; break;
      }
    }
    const ms = ((epochMs % 1000) + 1000) % 1000;
    const asUtcMs = OrigDateUTC(year, month, day, hour, minute, second, ms);
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

  function localComponentsToEpoch(year, month, day = 1, hour = 0, minute = 0, second = 0, ms = 0) {
    let y = +year;
    if (y >= 0 && y <= 99) y += 1900;
    const guessUtc = OrigDateUTC(y, +month, +day, +hour, +minute, +second, +ms);
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

  const ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
  function parseInTargetTz(str) {
    if (typeof str === 'string') {
      const trimmed = str.trim();
      const m = ISO_LOCAL_RE.exec(trimmed);
      if (m) {
        const yr = +m[1];
        const mo = (+m[2]) - 1;
        const dy = +m[3];
        const hr = +m[4];
        const mn = +m[5];
        const sc = m[6] ? +m[6] : 0;
        const ms = m[7] ? +(m[7].padEnd(3, '0')) : 0;
        return localComponentsToEpoch(yr, mo, dy, hr, mn, sc, ms);
      }
    }
    return OrigDateParse(str);
  }

  const proto = OrigDate.prototype;
  const origGetTime = proto.getTime;

  function patchProtoMethod(name, fn) {
    markNative(fn, name);
    defineProp(proto, name, {
      value: fn,
      writable: true,
      configurable: true
    });
  }

  patchProtoMethod('getTimezoneOffset', function getTimezoneOffset() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.offsetMin : NaN;
  });

  patchProtoMethod('getFullYear', function getFullYear() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.year : NaN;
  });

  patchProtoMethod('getYear', function getYear() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.year - 1900 : NaN;
  });

  patchProtoMethod('getMonth', function getMonth() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.month : NaN;
  });

  patchProtoMethod('getDate', function getDate() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.day : NaN;
  });

  patchProtoMethod('getDay', function getDay() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.weekday : NaN;
  });

  patchProtoMethod('getHours', function getHours() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.hour : NaN;
  });

  patchProtoMethod('getMinutes', function getMinutes() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.minute : NaN;
  });

  patchProtoMethod('getSeconds', function getSeconds() {
    const p = getTargetParts(origGetTime.call(this));
    return p ? p.second : NaN;
  });

  patchProtoMethod('toString', function toString() {
    return formatFullString(origGetTime.call(this));
  });

  patchProtoMethod('toDateString', function toDateString() {
    return formatDateString(origGetTime.call(this));
  });

  patchProtoMethod('toTimeString', function toTimeString() {
    return formatTimeString(origGetTime.call(this));
  });

  const origToLocaleString = proto.toLocaleString;
  const origToLocaleDateString = proto.toLocaleDateString;
  const origToLocaleTimeString = proto.toLocaleTimeString;

  function withTzOptions(options) {
    const opts = options ? Object.assign({}, options) : {};
    if (!opts.timeZone) opts.timeZone = TARGET_TZ;
    return opts;
  }

  function resolveLocaleArg(locales) {
    if (locales !== undefined) return locales;
    return SPOOF_LANG ? TARGET_LOCALE : undefined;
  }

  patchProtoMethod('toLocaleString', function toLocaleString(locales, options) {
    return origToLocaleString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  patchProtoMethod('toLocaleDateString', function toLocaleDateString(locales, options) {
    return origToLocaleDateString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  patchProtoMethod('toLocaleTimeString', function toLocaleTimeString(locales, options) {
    return origToLocaleTimeString.call(this, resolveLocaleArg(locales), withTzOptions(options));
  });

  const origSetTime = proto.setTime;
  patchProtoMethod('setHours', function setHours(h, m, s, ms) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year,
      p.month,
      p.day,
      h !== undefined ? +h : p.hour,
      m !== undefined ? +m : p.minute,
      s !== undefined ? +s : p.second,
      ms !== undefined ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod('setMinutes', function setMinutes(m, s, ms) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year, p.month, p.day, p.hour,
      +m,
      s !== undefined ? +s : p.second,
      ms !== undefined ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod('setSeconds', function setSeconds(s, ms) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year, p.month, p.day, p.hour, p.minute,
      +s,
      ms !== undefined ? +ms : p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod('setDate', function setDate(d) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(p.year, p.month, +d, p.hour, p.minute, p.second, p.ms);
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod('setMonth', function setMonth(mo, d) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      p.year,
      +mo,
      d !== undefined ? +d : p.day,
      p.hour, p.minute, p.second, p.ms
    );
    return origSetTime.call(this, epoch);
  });

  patchProtoMethod('setFullYear', function setFullYear(y, mo, d) {
    const p = getTargetParts(origGetTime.call(this));
    if (!p) return NaN;
    const epoch = localComponentsToEpoch(
      +y,
      mo !== undefined ? +mo : p.month,
      d !== undefined ? +d : p.day,
      p.hour, p.minute, p.second, p.ms
    );
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
      const epoch = localComponentsToEpoch(y, mo, d, h, mn, s, ms);
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

  // Wrap Intl.DateTimeFormat
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

  const origResolvedOptions = OrigDTF.prototype.resolvedOptions;
  const patchedResolvedOptions = function resolvedOptions() {
    const res = origResolvedOptions.call(this);
    if (!res.timeZone) res.timeZone = TARGET_TZ;
    if (SPOOF_LANG && res.locale) {
      res.locale = TARGET_LOCALE;
    }
    return res;
  };
  markNative(patchedResolvedOptions, 'resolvedOptions');
  defineProp(OrigDTF.prototype, 'resolvedOptions', {
    value: patchedResolvedOptions,
    writable: true,
    configurable: true
  });

  // Language & Locale overrides (Navigator + other Intl formatters + SpeechSynthesis voices)
  if (SPOOF_LANG) {
    const wrapIntlCtor = (OrigCtor, name) => {
      if (!OrigCtor) return;
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
      defineProp(Intl, name, { value: p, writable: true, configurable: true });
    };

    wrapIntlCtor(OrigNF, 'NumberFormat');
    wrapIntlCtor(OrigPR, 'PluralRules');
    wrapIntlCtor(OrigRTF, 'RelativeTimeFormat');
    wrapIntlCtor(OrigCollator, 'Collator');
    wrapIntlCtor(OrigListFormat, 'ListFormat');

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
        const US_SYSTEM_VOICES = [
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
              } else if (!hasNativeEnLocal && mappedLocalIdx < US_SYSTEM_VOICES.length) {
                const tpl = US_SYSTEM_VOICES[mappedLocalIdx++];
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
