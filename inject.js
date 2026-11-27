(() => {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : self;
  const cfgDesc = Object.getOwnPropertyDescriptor(root, '__tz_s__');
  const legacyCfg = !cfgDesc ? root.__TZ_LOCALE_CFG__ : undefined;
  const cfg = (cfgDesc && cfgDesc.value) || legacyCfg;
  try {
    delete root.__tz_s__;
    if (legacyCfg) delete root.__TZ_LOCALE_CFG__;
  } catch (_) {}

  if (!cfg || !cfg.tz) return;

  const TARGET_TZ = String(cfg.tz);
  const TARGET_LOCALE = String(cfg.locale || 'en-US');
  const RAW_LANGS = Array.isArray(cfg.languages) && cfg.languages.length > 0
    ? cfg.languages.slice()
    : ['en-US', 'en'];
  const SPOOF_LANG = Boolean(cfg.spoofLang);

  // Save root intrinsics BEFORE any patching for pure internal timezone math
  const RootDate = root.Date;
  const RootDateUTC = RootDate.UTC;
  const RootDateNow = RootDate.now;
  const RootDateParse = RootDate.parse;
  const rootDateProto = RootDate.prototype;
  const rootGetTime = rootDateProto.getTime;
  const rootSetUTCFullYear = rootDateProto.setUTCFullYear;
  const rootGetFullYear = rootDateProto.getFullYear;
  const rootGetMonth = rootDateProto.getMonth;
  const rootGetDate = rootDateProto.getDate;
  const rootGetHours = rootDateProto.getHours;
  const rootGetMinutes = rootDateProto.getMinutes;
  const rootGetSeconds = rootDateProto.getSeconds;
  const rootGetMilliseconds = rootDateProto.getMilliseconds;

  const RootDTF = root.Intl.DateTimeFormat;
  const RootGetCanonicalLocales = root.Intl.getCanonicalLocales;
  const defineProp = Object.defineProperty;
  const getOwnPropDesc = Object.getOwnPropertyDescriptor;
  const objCreate = Object.create;
  const reflectApply = Reflect.apply;
  const reflectConstruct = Reflect.construct;

  // Shared cross-realm WeakMap so iframe.contentWindow.Function.prototype.toString.call(top.Date)
  // returns exact native source strings across all same-origin realms
  const nativeSourceMap = new WeakMap();
  const patchedRealms = new WeakSet();

  const markNative = (fn, label) => {
    if (typeof fn === 'function') {
      const fnName = label !== undefined ? label : (fn.name || '');
      nativeSourceMap.set(fn, `function ${fnName}() { [native code] }`);
    }
    return fn;
  };

  function cleanErrorStack(err, RealmObject) {
    try {
      if (err && (typeof err === 'object' || typeof err === 'function') && typeof err.stack === 'string') {
        const lines = err.stack.split('\n');
        const filtered = [];
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          if (i > 0 && (ln.includes('inject.js') || ln.includes('__tz_'))) {
            continue;
          }
          filtered.push(ln);
        }
        if (filtered.length !== lines.length) {
          (RealmObject ? RealmObject.defineProperty : defineProp)(err, 'stack', {
            value: filtered.join('\n'),
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
      }
    } catch (_) {}
    return err;
  }

  // Concise object methods & getters: NO .prototype property, non-constructible (throws TypeError on `new`),
  // ownKeys === ['length', 'name'], matching V8 C++ built-in methods & WebIDL getters bit-for-bit.
  function makeMethod(name, arity, impl, RealmObject) {
    let fn;
    switch (arity) {
      case 1:
        fn = ({
          [name](a0, ..._r) {
            try {
              return reflectApply(impl, this, arguments);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        })[name];
        break;
      case 2:
        fn = ({
          [name](a0, a1, ..._r) {
            try {
              return reflectApply(impl, this, arguments);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        })[name];
        break;
      case 3:
        fn = ({
          [name](a0, a1, a2, ..._r) {
            try {
              return reflectApply(impl, this, arguments);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        })[name];
        break;
      case 4:
        fn = ({
          [name](a0, a1, a2, a3, ..._r) {
            try {
              return reflectApply(impl, this, arguments);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        })[name];
        break;
      default:
        fn = ({
          [name](..._r) {
            try {
              return reflectApply(impl, this, arguments);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        })[name];
        break;
    }
    return markNative(fn, name);
  }

  function makeGetter(propName, impl, RealmObject) {
    const holder = {
      get [propName]() {
        try {
          return reflectApply(impl, this, []);
        } catch (e) {
          throw cleanErrorStack(e, RealmObject);
        }
      }
    };
    const getter = getOwnPropDesc(holder, propName).get;
    return markNative(getter, `get ${propName}`);
  }

  // Pre-create formatters using untouched RootDTF for exact target timezone & historical LMT calculation
  const partsFmt = new RootDTF('en-US', {
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

  const longTzFmt = new RootDTF('en-US', {
    timeZone: TARGET_TZ,
    timeZoneName: 'long'
  });

  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fullYearUtcMs(fullYear, month, day = 1, hour = 0, minute = 0, second = 0, ms = 0) {
    const yr = +fullYear;
    if (Number.isNaN(yr)) return NaN;
    if (yr >= 0 && yr <= 99) {
      const tmp = new RootDate(RootDateUTC(2000, +month, +day, +hour, +minute, +second, +ms));
      if (Number.isNaN(rootGetTime.call(tmp))) return NaN;
      return rootSetUTCFullYear.call(tmp, yr);
    }
    return RootDateUTC(yr, +month, +day, +hour, +minute, +second, +ms);
  }

  function getTargetParts(epochMs) {
    if (Number.isNaN(epochMs) || !Number.isFinite(epochMs)) return null;
    const d = new RootDate(epochMs);
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
    const realUtcYear = rootGetFullYear.call(d);
    if (realUtcYear <= 0 && year > 0 && realUtcYear < -1) {
      year = 1 - year;
    }
    const ms = ((epochMs % 1000) + 1000) % 1000;
    const asUtcMs = fullYearUtcMs(year, month, day, hour, minute, second, ms);
    const offsetSec = Math.round((epochMs - asUtcMs) / 1000);
    // V8 truncates sub-minute historical LMT offsets toward zero for getTimezoneOffset()
    const offsetMin = Math.trunc(offsetSec / 60);
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
      offsetSec,
      offsetMin: offsetMin === 0 ? 0 : offsetMin
    };
  }

  function getLongTzName(epochMs) {
    try {
      const parts = longTzFmt.formatToParts(new RootDate(epochMs));
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

  function formatGmtOffsetSec(offsetSec) {
    const sign = offsetSec <= 0 ? '+' : '-';
    const abs = Math.abs(offsetSec);
    const hh = pad2(Math.floor(abs / 3600));
    const mm = pad2(Math.floor((abs % 3600) / 60));
    const ss = abs % 60;
    return ss === 0 ? `GMT${sign}${hh}${mm}` : `GMT${sign}${hh}${mm}${pad2(ss)}`;
  }

  function formatDateString(epochMs) {
    const p = getTargetParts(epochMs);
    if (!p) return 'Invalid Date';
    return `${p.weekdayStr} ${MONTHS[p.month]} ${pad2(p.day)} ${pad4(p.year)}`;
  }

  function formatTimeString(epochMs) {
    const p = getTargetParts(epochMs);
    if (!p) return 'Invalid Date';
    const gmt = formatGmtOffsetSec(p.offsetSec);
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
    const adjusted = guessUtc + p1.offsetSec * 1000;
    const p2 = getTargetParts(adjusted);
    if (p2 && p2.offsetSec !== p1.offsetSec) {
      return guessUtc + p2.offsetSec * 1000;
    }
    return adjusted;
  }

  const ISO_DATE_ONLY_RE = /^(?:\d{4}|[+-]\d{6})(?:-\d{2}(?:-\d{2})?)?$/;
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
      return RootDateParse(str);
    }
    const trimmed = str.trim();
    if (!trimmed) return NaN;

    if (ISO_DATE_ONLY_RE.test(trimmed)) {
      return RootDateParse(trimmed);
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
      return RootDateParse(trimmed);
    }

    const osEpoch = RootDateParse(trimmed);
    if (Number.isNaN(osEpoch)) return NaN;
    const osDate = new RootDate(osEpoch);
    return localComponentsToEpoch(
      rootGetFullYear.call(osDate),
      rootGetMonth.call(osDate),
      rootGetDate.call(osDate),
      rootGetHours.call(osDate),
      rootGetMinutes.call(osDate),
      rootGetSeconds.call(osDate),
      rootGetMilliseconds.call(osDate)
    );
  }

  // ECMA-262 ToPrimitive(input, 'default') for `new Date(obj)`
  function toDefaultPrimitive(val, RealmTypeError) {
    if (val === null || (typeof val !== 'object' && typeof val !== 'function')) {
      return val;
    }
    const exotic = val[Symbol.toPrimitive];
    if (exotic !== undefined && exotic !== null) {
      if (typeof exotic !== 'function') {
        throw new RealmTypeError('@@toPrimitive is not a function');
      }
      const res = exotic.call(val, 'default');
      if (res !== null && (typeof res === 'object' || typeof res === 'function')) {
        throw new RealmTypeError('Cannot convert object to primitive value');
      }
      return res;
    }
    if (typeof val.valueOf === 'function') {
      const v = val.valueOf();
      if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return v;
    }
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (s === null || (typeof s !== 'object' && typeof s !== 'function')) return s;
    }
    throw new RealmTypeError('Cannot convert object to primitive value');
  }

  // ECMA-402 exact options & locale handling:
  // - Preserves TypeError on `options === null` or primitives (for Intl constructors)
  // - Preserves RangeError on `options.timeZone === ''` / `null` / `false` / invalid string
  // - Preserves prototype inheritance & getter order via Object.create(options, ...)
  function withTzOptions(options) {
    if (options === undefined) {
      return { timeZone: TARGET_TZ };
    }
    if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
      return options;
    }
    const explicitTz = options.timeZone;
    if (explicitTz !== undefined) {
      return options;
    }
    return objCreate(options, {
      timeZone: {
        value: TARGET_TZ,
        writable: true,
        enumerable: true,
        configurable: true
      }
    });
  }

  function resolveLocaleArg(locales) {
    if (!SPOOF_LANG) return locales;
    if (locales === undefined) return TARGET_LOCALE;
    const canon = RootGetCanonicalLocales(locales);
    return canon.length === 0 ? TARGET_LOCALE : canon;
  }

  const FALLBACK_VOICES_GB = [
    { name: 'Microsoft Hazel - English (United Kingdom)', voiceURI: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB', default: true },
    { name: 'Microsoft Susan - English (United Kingdom)', voiceURI: 'Microsoft Susan - English (United Kingdom)', lang: 'en-GB', default: false },
    { name: 'Microsoft George - English (United Kingdom)', voiceURI: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', default: false }
  ];
  const FALLBACK_VOICES_US = [
    { name: 'Microsoft David - English (United States)', voiceURI: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
    { name: 'Microsoft Mark - English (United States)', voiceURI: 'Microsoft Mark - English (United States)', lang: 'en-US', default: false },
    { name: 'Microsoft Zira - English (United States)', voiceURI: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false }
  ];

  // Patch any same-origin Window / Realm (main window + synchronous about:blank / srcdoc iframes + window.open)
  function patchRealm(win) {
    if (!win || (typeof win !== 'object' && typeof win !== 'function')) return;
    if (patchedRealms.has(win)) return;

    let OrigDate, OrigIntl, OrigFnProto, RealmObject, RealmTypeError;
    try {
      OrigDate = win.Date;
      OrigIntl = win.Intl;
      OrigFnProto = win.Function && win.Function.prototype;
      RealmObject = win.Object || Object;
      RealmTypeError = win.TypeError || TypeError;
      if (typeof OrigDate !== 'function' || !OrigIntl || !OrigFnProto) return;
    } catch (_) {
      // Cross-origin WindowProxy throws SecurityError on property access — ignore safely
      return;
    }

    patchedRealms.add(win);

    const realmDefine = RealmObject.defineProperty;
    const realmGetOwnDesc = RealmObject.getOwnPropertyDescriptor;

    // 1. Function.prototype.toString (concise method: no .prototype, non-constructible, shared nativeSourceMap)
    const OrigFnToString = OrigFnProto.toString;
    const patchedFnToString = makeMethod('toString', 0, function () {
      if (typeof this === 'function' && nativeSourceMap.has(this)) {
        return nativeSourceMap.get(this);
      }
      return reflectApply(OrigFnToString, this, []);
    }, RealmObject);

    realmDefine(OrigFnProto, 'toString', {
      value: patchedFnToString,
      writable: true,
      enumerable: false,
      configurable: true
    });

    // 2. Date & Date.prototype
    const proto = OrigDate.prototype;
    const origGetTime = proto.getTime;
    const origSetTime = proto.setTime;
    const origToLocaleString = proto.toLocaleString;
    const origToLocaleDateString = proto.toLocaleDateString;
    const origToLocaleTimeString = proto.toLocaleTimeString;

    const patchProtoMethod = (targetProto, name, arity, impl) => {
      const fn = makeMethod(name, arity, impl, RealmObject);
      realmDefine(targetProto, name, {
        value: fn,
        writable: true,
        enumerable: false,
        configurable: true
      });
    };

    patchProtoMethod(proto, 'getTimezoneOffset', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.offsetMin : NaN;
    });
    patchProtoMethod(proto, 'getFullYear', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.year : NaN;
    });
    patchProtoMethod(proto, 'getYear', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.year - 1900 : NaN;
    });
    patchProtoMethod(proto, 'getMonth', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.month : NaN;
    });
    patchProtoMethod(proto, 'getDate', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.day : NaN;
    });
    patchProtoMethod(proto, 'getDay', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.weekday : NaN;
    });
    patchProtoMethod(proto, 'getHours', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.hour : NaN;
    });
    patchProtoMethod(proto, 'getMinutes', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.minute : NaN;
    });
    patchProtoMethod(proto, 'getSeconds', 0, function () {
      const p = getTargetParts(origGetTime.call(this));
      return p ? p.second : NaN;
    });
    patchProtoMethod(proto, 'toString', 0, function () {
      return formatFullString(origGetTime.call(this));
    });
    patchProtoMethod(proto, 'toDateString', 0, function () {
      return formatDateString(origGetTime.call(this));
    });
    patchProtoMethod(proto, 'toTimeString', 0, function () {
      return formatTimeString(origGetTime.call(this));
    });

    // ECMA-402: Date.prototype.toLocale*String all have .length === 0
    patchProtoMethod(proto, 'toLocaleString', 0, function (locales, options) {
      return origToLocaleString.call(this, resolveLocaleArg(locales), withTzOptions(options));
    });
    patchProtoMethod(proto, 'toLocaleDateString', 0, function (locales, options) {
      return origToLocaleDateString.call(this, resolveLocaleArg(locales), withTzOptions(options));
    });
    patchProtoMethod(proto, 'toLocaleTimeString', 0, function (locales, options) {
      return origToLocaleTimeString.call(this, resolveLocaleArg(locales), withTzOptions(options));
    });

    patchProtoMethod(proto, 'setHours', 4, function (h, m, s, ms) {
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
    patchProtoMethod(proto, 'setMinutes', 3, function (m, s, ms) {
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
    patchProtoMethod(proto, 'setSeconds', 2, function (s, ms) {
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
    patchProtoMethod(proto, 'setDate', 1, function (d) {
      if (arguments.length === 0) return origSetTime.call(this, NaN);
      const p = getTargetParts(origGetTime.call(this));
      if (!p) return NaN;
      const epoch = localComponentsToEpoch(p.year, p.month, +d, p.hour, p.minute, p.second, p.ms);
      return origSetTime.call(this, epoch);
    });
    patchProtoMethod(proto, 'setMonth', 2, function (mo, d) {
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
    patchProtoMethod(proto, 'setFullYear', 3, function (y, mo, d) {
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
    patchProtoMethod(proto, 'setYear', 1, function (y) {
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

    const isDateObj = (v) => {
      if (!v || typeof v !== 'object') return false;
      try {
        rootGetTime.call(v);
        return true;
      } catch (_) {
        return false;
      }
    };

    const DateProxy = new Proxy(OrigDate, {
      apply() {
        return formatFullString(RootDateNow());
      },
      construct(target, args, newTarget) {
        try {
          if (args.length === 0) {
            return reflectConstruct(target, [RootDateNow()], newTarget);
          }
          if (args.length === 1) {
            const arg0 = args[0];
            if (isDateObj(arg0)) {
              return reflectConstruct(target, [rootGetTime.call(arg0)], newTarget);
            }
            const prim = toDefaultPrimitive(arg0, RealmTypeError);
            if (typeof prim === 'string') {
              return reflectConstruct(target, [parseInTargetTz(prim)], newTarget);
            }
            return reflectConstruct(target, [prim], newTarget);
          }
          const [y, mo, d = 1, h = 0, mn = 0, s = 0, ms = 0] = args;
          let fullY = +y;
          if (!Number.isNaN(fullY)) {
            const truncY = Math.trunc(fullY);
            if (truncY >= 0 && truncY <= 99) fullY = 1900 + truncY;
          }
          const epoch = localComponentsToEpoch(fullY, mo, d, h, mn, s, ms);
          return reflectConstruct(target, [epoch], newTarget);
        } catch (e) {
          throw cleanErrorStack(e, RealmObject);
        }
      }
    });

    markNative(DateProxy, 'Date');
    const parseMethod = makeMethod('parse', 1, function (str) {
      return parseInTargetTz(String(str));
    }, RealmObject);
    realmDefine(DateProxy, 'parse', { value: parseMethod, writable: true, enumerable: false, configurable: true });
    realmDefine(proto, 'constructor', { value: DateProxy, writable: true, enumerable: false, configurable: true });
    realmDefine(win, 'Date', { value: DateProxy, writable: true, enumerable: false, configurable: true });

    // 3. Intl.DateTimeFormat
    const OrigDTF = OrigIntl.DateTimeFormat;
    const DTFProxy = new Proxy(OrigDTF, {
      apply(target, _thisArg, args) {
        try {
          const [locales, options] = args;
          return reflectConstruct(target, [resolveLocaleArg(locales), withTzOptions(options)]);
        } catch (e) {
          throw cleanErrorStack(e, RealmObject);
        }
      },
      construct(target, args, newTarget) {
        try {
          const [locales, options] = args;
          return reflectConstruct(target, [resolveLocaleArg(locales), withTzOptions(options)], newTarget);
        } catch (e) {
          throw cleanErrorStack(e, RealmObject);
        }
      }
    });
    markNative(DTFProxy, 'DateTimeFormat');
    realmDefine(OrigDTF.prototype, 'constructor', { value: DTFProxy, writable: true, enumerable: false, configurable: true });
    realmDefine(OrigIntl, 'DateTimeFormat', { value: DTFProxy, writable: true, enumerable: false, configurable: true });

    // 4. TC39 Temporal API
    const RealmTemporal = win.Temporal;
    if (RealmTemporal && RealmTemporal.Now) {
      const tNow = RealmTemporal.Now;
      if (typeof tNow.timeZoneId === 'function') {
        const tzIdFn = makeMethod('timeZoneId', 0, function () {
          return TARGET_TZ;
        }, RealmObject);
        realmDefine(tNow, 'timeZoneId', { value: tzIdFn, writable: true, enumerable: false, configurable: true });
      }

      for (const methodName of ['zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO']) {
        const origMethod = tNow[methodName];
        if (typeof origMethod === 'function') {
          const wrapped = makeMethod(methodName, 0, function () {
            const tzArg = arguments[0] === undefined ? TARGET_TZ : arguments[0];
            return origMethod.call(this, tzArg);
          }, RealmObject);
          realmDefine(tNow, methodName, { value: wrapped, writable: true, enumerable: false, configurable: true });
        }
      }

      if (RealmTemporal.Instant && RealmTemporal.Instant.prototype && typeof RealmTemporal.Instant.prototype.toLocaleString === 'function') {
        const origInstTls = RealmTemporal.Instant.prototype.toLocaleString;
        patchProtoMethod(RealmTemporal.Instant.prototype, 'toLocaleString', 0, function (locales, options) {
          return origInstTls.call(this, resolveLocaleArg(locales), withTzOptions(options));
        });
      }
    }

    // 5. Language & Locale overrides
    if (SPOOF_LANG) {
      const realmLanguages = RealmObject.freeze((win.Array ? win.Array.from(RAW_LANGS) : RAW_LANGS.slice()));

      const wrapIntlCtor = (name) => {
        const OrigCtor = OrigIntl[name];
        if (typeof OrigCtor !== 'function') return;
        const p = new Proxy(OrigCtor, {
          apply(target, _thisArg, args) {
            try {
              const [locales, options] = args;
              return reflectConstruct(target, [resolveLocaleArg(locales), options]);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          },
          construct(target, args, newTarget) {
            try {
              const [locales, options] = args;
              return reflectConstruct(target, [resolveLocaleArg(locales), options], newTarget);
            } catch (e) {
              throw cleanErrorStack(e, RealmObject);
            }
          }
        });
        markNative(p, name);
        if (OrigCtor.prototype) {
          realmDefine(OrigCtor.prototype, 'constructor', { value: p, writable: true, enumerable: false, configurable: true });
        }
        realmDefine(OrigIntl, name, { value: p, writable: true, enumerable: false, configurable: true });
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

      if (win.Number && win.Number.prototype && typeof win.Number.prototype.toLocaleString === 'function') {
        const origNumTls = win.Number.prototype.toLocaleString;
        patchProtoMethod(win.Number.prototype, 'toLocaleString', 0, function (locales, options) {
          return origNumTls.call(this, resolveLocaleArg(locales), options);
        });
      }

      if (win.BigInt && win.BigInt.prototype && typeof win.BigInt.prototype.toLocaleString === 'function') {
        const origBigTls = win.BigInt.prototype.toLocaleString;
        patchProtoMethod(win.BigInt.prototype, 'toLocaleString', 0, function (locales, options) {
          return origBigTls.call(this, resolveLocaleArg(locales), options);
        });
      }

      if (win.String && win.String.prototype && typeof win.String.prototype.localeCompare === 'function') {
        const origLocaleCompare = win.String.prototype.localeCompare;
        patchProtoMethod(win.String.prototype, 'localeCompare', 1, function (that, locales, options) {
          return origLocaleCompare.call(this, that, resolveLocaleArg(locales), options);
        });
      }

      if (RealmTemporal) {
        for (const typeName of [
          'PlainDate',
          'PlainTime',
          'PlainDateTime',
          'ZonedDateTime',
          'PlainYearMonth',
          'PlainMonthDay',
          'Duration'
        ]) {
          const ctor = RealmTemporal[typeName];
          if (ctor && ctor.prototype && typeof ctor.prototype.toLocaleString === 'function') {
            const origTls = ctor.prototype.toLocaleString;
            patchProtoMethod(ctor.prototype, 'toLocaleString', 0, function (locales, options) {
              return origTls.call(this, resolveLocaleArg(locales), options);
            });
          }
        }
      }

      if (win.Navigator && win.Navigator.prototype) {
        const navProto = win.Navigator.prototype;
        const langDesc = realmGetOwnDesc(navProto, 'language');
        if (!langDesc || langDesc.configurable) {
          const getLang = makeGetter('language', () => TARGET_LOCALE, RealmObject);
          realmDefine(navProto, 'language', {
            get: getLang,
            set: undefined,
            enumerable: true,
            configurable: true
          });
        }
        const langsDesc = realmGetOwnDesc(navProto, 'languages');
        if (!langsDesc || langsDesc.configurable) {
          const getLangs = makeGetter('languages', () => realmLanguages, RealmObject);
          realmDefine(navProto, 'languages', {
            get: getLangs,
            set: undefined,
            enumerable: true,
            configurable: true
          });
        }
      }

      // Web Speech API (speechSynthesis.getVoices) with WebIDL-compliant concise getters
      if (
        win.SpeechSynthesis &&
        win.SpeechSynthesis.prototype &&
        win.SpeechSynthesisVoice &&
        win.SpeechSynthesisVoice.prototype
      ) {
        const ssvProto = win.SpeechSynthesisVoice.prototype;
        const origNameGet = realmGetOwnDesc(ssvProto, 'name')?.get;
        const origUriGet = realmGetOwnDesc(ssvProto, 'voiceURI')?.get;
        const origLangGet = realmGetOwnDesc(ssvProto, 'lang')?.get;
        const origDefaultGet = realmGetOwnDesc(ssvProto, 'default')?.get;
        const origLocalGet = realmGetOwnDesc(ssvProto, 'localService')?.get;
        const origGetVoices = win.SpeechSynthesis.prototype.getVoices;

        if (origNameGet && origUriGet && origLangGet && origDefaultGet && origLocalGet && origGetVoices) {
          const voiceOverrides = new WeakMap();
          const FALLBACK_SYSTEM_VOICES = TARGET_LOCALE === 'en-GB' ? FALLBACK_VOICES_GB : FALLBACK_VOICES_US;

          const patchVoiceGetter = (prop, origGetter) => {
            const getter = makeGetter(prop, function () {
              const ov = voiceOverrides.get(this);
              if (ov && prop in ov) return ov[prop];
              return origGetter.call(this);
            }, RealmObject);
            realmDefine(ssvProto, prop, {
              get: getter,
              set: undefined,
              enumerable: true,
              configurable: true
            });
          };

          patchVoiceGetter('name', origNameGet);
          patchVoiceGetter('voiceURI', origUriGet);
          patchVoiceGetter('lang', origLangGet);
          patchVoiceGetter('default', origDefaultGet);

          patchProtoMethod(win.SpeechSynthesis.prototype, 'getVoices', 0, function () {
            const rawVoices = origGetVoices.call(this);
            if (!Array.isArray(rawVoices) || rawVoices.length === 0) return rawVoices;

            const result = win.Array ? new win.Array() : [];
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
              } else {
                if (origDefaultGet.call(v) && defaultAssigned) {
                  voiceOverrides.set(v, { default: false });
                }
                result.push(v);
              }
            }

            return result;
          });
        }
      }
    }

    // 6. Synchronously patch same-origin iframes (about:blank / srcdoc) & window.open before page scripts read them
    const hookFrameOwnerProto = (Ctor) => {
      if (!Ctor || !Ctor.prototype) return;
      const fp = Ctor.prototype;
      const cwDesc = realmGetOwnDesc(fp, 'contentWindow');
      if (cwDesc && cwDesc.get && cwDesc.configurable) {
        const origCwGet = cwDesc.get;
        const getCw = makeGetter('contentWindow', function () {
          const childWin = origCwGet.call(this);
          if (childWin) patchRealm(childWin);
          return childWin;
        }, RealmObject);
        realmDefine(fp, 'contentWindow', {
          get: getCw,
          set: undefined,
          enumerable: Boolean(cwDesc.enumerable),
          configurable: true
        });
      }
      const cdDesc = realmGetOwnDesc(fp, 'contentDocument');
      if (cdDesc && cdDesc.get && cdDesc.configurable) {
        const origCdGet = cdDesc.get;
        const getCd = makeGetter('contentDocument', function () {
          const childDoc = origCdGet.call(this);
          if (childDoc && childDoc.defaultView) patchRealm(childDoc.defaultView);
          return childDoc;
        }, RealmObject);
        realmDefine(fp, 'contentDocument', {
          get: getCd,
          set: undefined,
          enumerable: Boolean(cdDesc.enumerable),
          configurable: true
        });
      }
    };

    const origIframeCwGet = win.HTMLIFrameElement?.prototype
      ? realmGetOwnDesc(win.HTMLIFrameElement.prototype, 'contentWindow')?.get
      : null;

    hookFrameOwnerProto(win.HTMLIFrameElement);
    hookFrameOwnerProto(win.HTMLFrameElement);
    hookFrameOwnerProto(win.HTMLObjectElement);

    // Also cover `window.frames[0]` access when caller skips `iframe.contentWindow`
    try {
      const winProto = win.Window && win.Window.prototype;
      const framesTarget = (winProto && realmGetOwnDesc(winProto, 'frames')) ? winProto : win;
      const framesDesc = realmGetOwnDesc(framesTarget, 'frames');
      if (framesDesc && framesDesc.get && framesDesc.configurable && origIframeCwGet) {
        const origFramesGet = framesDesc.get;
        const getFrames = makeGetter('frames', function () {
          try {
            const doc = win.document;
            if (doc && typeof doc.getElementsByTagName === 'function') {
              const iframes = doc.getElementsByTagName('iframe');
              for (let i = 0; i < iframes.length; i++) {
                const cw = origIframeCwGet.call(iframes[i]);
                if (cw) patchRealm(cw);
              }
            }
          } catch (_) {}
          return origFramesGet.call(this);
        }, RealmObject);
        realmDefine(framesTarget, 'frames', {
          get: getFrames,
          set: framesDesc.set,
          enumerable: Boolean(framesDesc.enumerable),
          configurable: true
        });
      }
    } catch (_) {}

    // Cover `const w = window.open('')` synchronous blank popup realms
    try {
      const winProto = win.Window && win.Window.prototype;
      const openTarget = (winProto && typeof winProto.open === 'function') ? winProto : win;
      const openDesc = realmGetOwnDesc(openTarget, 'open');
      if (openDesc && typeof openDesc.value === 'function' && openDesc.configurable) {
        const origOpen = openDesc.value;
        const wrappedOpen = makeMethod('open', 0, function () {
          const opened = reflectApply(origOpen, this, arguments);
          if (opened) patchRealm(opened);
          return opened;
        }, RealmObject);
        realmDefine(openTarget, 'open', {
          value: wrappedOpen,
          writable: Boolean(openDesc.writable),
          enumerable: Boolean(openDesc.enumerable),
          configurable: true
        });
      }
    } catch (_) {}
  }

  patchRealm(root);
})();
