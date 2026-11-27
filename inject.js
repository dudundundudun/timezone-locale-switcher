(() => {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : self;
  const cfgDesc = Object.getOwnPropertyDescriptor(root, '__tz_s__');
  const legacyCfg = !cfgDesc ? root.__TZ_LOCALE_CFG__ : undefined;
  const initialCfg = (cfgDesc && cfgDesc.value) || legacyCfg;
  try {
    delete root.__tz_s__;
    if (legacyCfg) delete root.__TZ_LOCALE_CFG__;
  } catch (_) {}

  if (!initialCfg || !initialCfg.tz) return;

  // Abort immediately inside cross-origin subframes (e.g. challenges.cloudflare.com) when the top-level tab
  // is in `excludedSites` ("Не подменять на этом сайте"), signaled by DNR session rule Server-Timing `tz_bypass`.
  try {
    if (root.top && root !== root.top && root.performance && typeof root.performance.getEntriesByType === 'function') {
      const navEntries = root.performance.getEntriesByType('navigation');
      const nav = navEntries && navEntries[0];
      if (nav && nav.serverTiming && nav.serverTiming.length > 0) {
        for (let i = 0; i < nav.serverTiming.length; i++) {
          if (nav.serverTiming[i] && nav.serverTiming[i].name === 'tz_bypass') {
            return;
          }
        }
      }
    }
  } catch (_) {}

  // Self-contained installer function so we can also serialize & bootstrap inside Dedicated/Shared Web Workers
  function installEnv(cfg) {
    'use strict';

    const envRoot = typeof globalThis !== 'undefined' ? globalThis : self;
    if (!cfg || !cfg.tz) return;

    const TARGET_TZ = String(cfg.tz);
    const TARGET_LOCALE = String(cfg.locale || 'en-US');
    const RAW_LANGS = Array.isArray(cfg.languages) && cfg.languages.length > 0
      ? cfg.languages.slice()
      : ['en-US', 'en'];
    const SPOOF_LANG = Boolean(cfg.spoofLang);
    const REALM_BRIDGE_TOKEN = '__tz_rb_4f9e2c71a805d3b6e1947c2a__';

    // Save untouched root intrinsics BEFORE patching (and check if a same-origin parent/top/opener already installed shared state)
    const RootError = envRoot.Error;
    let SELF_STACK_MARKER = 'inject.js';
    try {
      const probeLines = String(new RootError().stack || '').split('\n');
      for (let i = 1; i < probeLines.length; i++) {
        const m = /\((.+):\d+:\d+\)$/.exec(probeLines[i].trim()) || /at\s+(.+):\d+:\d+$/.exec(probeLines[i].trim());
        if (m && m[1]) {
          SELF_STACK_MARKER = m[1];
          break;
        }
      }
    } catch (_) {}

    // Coordinate across same-origin frames (about:blank, srcdoc, subframes, popups) without adding any own property to Window:
    // prevents double-patching when Chrome's `allFrames: true` content script runs after synchronous parent DOM hooks,
    // and shares a single WeakMap/Blob registry across all same-origin realms.
    for (const rel of ['top', 'parent', 'opener']) {
      try {
        const relWin = envRoot[rel];
        if (relWin && relWin !== envRoot) {
          const relFnProto = (relWin.Function && relWin.Function.prototype) ||
            (typeof relWin.Date === 'function' ? Object.getPrototypeOf(relWin.Date) : null) ||
            (typeof relWin.setTimeout === 'function' ? Object.getPrototypeOf(relWin.setTimeout) : null);
          if (relFnProto && typeof relFnProto.toString === 'function') {
            const shared = relFnProto.toString.call(REALM_BRIDGE_TOKEN);
            if (shared && typeof shared.patchRealm === 'function') {
              shared.patchRealm(envRoot);
              return;
            }
          }
        }
      } catch (_) {}
    }

    const RootDate = envRoot.Date;
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

    const RootDTF = envRoot.Intl.DateTimeFormat;
    const RootGetCanonicalLocales = envRoot.Intl.getCanonicalLocales;
    const defineProp = Object.defineProperty;
    const getOwnPropDesc = Object.getOwnPropertyDescriptor;
    const objCreate = Object.create;
    const reflectApply = Reflect.apply;
    const reflectConstruct = Reflect.construct;
    const reflectGetProto = Reflect.getPrototypeOf;
    const reflectSetProto = Reflect.setPrototypeOf;
    const origBlobSizeGet = envRoot.Blob && envRoot.Blob.prototype
      ? getOwnPropDesc(envRoot.Blob.prototype, 'size')?.get
      : null;

    const nativeSourceMap = new WeakMap();
    const patchedRealms = new WeakSet();
    const trackedBlobs = new Map();
    const blobSizeGetters = new Set();
    if (origBlobSizeGet) blobSizeGetters.add(origBlobSizeGet);

    function isGenuineBlob(v) {
      if (!v || typeof v !== 'object') return false;
      for (const getter of blobSizeGetters) {
        try {
          getter.call(v);
          return true;
        } catch (_) {}
      }
      return Boolean(envRoot.Blob && v instanceof envRoot.Blob);
    }

    const markNative = (fn, label) => {
      if (typeof fn === 'function') {
        const fnName = label !== undefined ? label : (fn.name || '');
        nativeSourceMap.set(fn, `function ${fnName}() { [native code] }`);
      }
      return fn;
    };

    function isOwnWrapperFrame(ln) {
      if (ln.includes('inject.js') || ln.includes('__tz_') || ln.includes('installEnv')) return true;
      if (SELF_STACK_MARKER && ln.includes(SELF_STACK_MARKER + ':')) return true;
      return false;
    }

    function cleanErrorStack(err, RealmObject, RealmError) {
      try {
        if (!err || (typeof err !== 'object' && typeof err !== 'function')) return err;
        if (RealmError && typeof RealmError.prepareStackTrace === 'function') return err;
        const getDesc = RealmObject ? RealmObject.getOwnPropertyDescriptor : getOwnPropDesc;
        const desc = getDesc(err, 'stack');
        if (!desc || !desc.configurable) return err;
        const rawStack = err.stack;
        if (typeof rawStack !== 'string') return err;
        const lines = rawStack.split('\n');
        const filtered = [];
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          if (i > 0 && isOwnWrapperFrame(ln)) {
            continue;
          }
          filtered.push(ln);
        }
        if (filtered.length !== lines.length) {
          const cleaned = filtered.join('\n');
          if ('value' in desc) {
            (RealmObject ? RealmObject.defineProperty : defineProp)(err, 'stack', {
              value: cleaned,
              writable: Boolean(desc.writable),
              enumerable: Boolean(desc.enumerable),
              configurable: true
            });
          } else if (typeof desc.set === 'function') {
            desc.set.call(err, cleaned);
          }
        }
      } catch (_) {}
      return err;
    }

    // Concise methods & getters: NO .prototype, non-constructible, exact .length & .name
    function makeMethod(name, arity, impl, RealmObject, RealmError) {
      let fn;
      switch (arity) {
        case 1:
          fn = ({
            [name](a0, ..._r) {
              try {
                return reflectApply(impl, this, arguments);
              } catch (e) {
                throw cleanErrorStack(e, RealmObject, RealmError);
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
                throw cleanErrorStack(e, RealmObject, RealmError);
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
                throw cleanErrorStack(e, RealmObject, RealmError);
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
                throw cleanErrorStack(e, RealmObject, RealmError);
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
                throw cleanErrorStack(e, RealmObject, RealmError);
              }
            }
          })[name];
          break;
      }
      return markNative(fn, name);
    }

    function makeGetter(propName, impl, RealmObject, RealmError) {
      const holder = {
        get [propName]() {
          try {
            return reflectApply(impl, this, []);
          } catch (e) {
            throw cleanErrorStack(e, RealmObject, RealmError);
          }
        }
      };
      const getter = getOwnPropDesc(holder, propName).get;
      return markNative(getter, `get ${propName}`);
    }

    function makeSetter(propName, impl, RealmObject, RealmError) {
      const holder = {
        set [propName](v) {
          try {
            return reflectApply(impl, this, [v]);
          } catch (e) {
            throw cleanErrorStack(e, RealmObject, RealmError);
          }
        }
      };
      const setter = getOwnPropDesc(holder, propName).set;
      return markNative(setter, `set ${propName}`);
    }

    // Proxy wrapper immune to V8 cyclic __proto__ Proxy detection
    // (Object.setPrototypeOf(Ctor, Ctor), Ctor.__proto__ = Ctor, Reflect.setPrototypeOf(Ctor, Object.create(Ctor)))
    function makeSafeProxy(TargetCtor, label, traps, RealmObject, RealmError) {
      let proxyRef;
      const fullTraps = Object.assign(
        {
          setPrototypeOf(target, v) {
            let cur = v;
            while (cur !== null && (typeof cur === 'object' || typeof cur === 'function')) {
              if (cur === proxyRef || cur === target) {
                const prevLim = RootError.stackTraceLimit;
                let st = '';
                try {
                  if (typeof prevLim === 'number' && prevLim < 10) {
                    RootError.stackTraceLimit = 10;
                  }
                  st = String(new RootError().stack || '');
                } catch (_) {
                } finally {
                  try {
                    if (typeof prevLim === 'number' && prevLim < 10) {
                      RootError.stackTraceLimit = prevLim;
                    }
                  } catch (_) {}
                }
                if (st.includes('Reflect.setPrototypeOf')) {
                  return false;
                }
                try {
                  RealmObject.setPrototypeOf(target, target);
                } catch (e) {
                  throw cleanErrorStack(e, RealmObject, RealmError);
                }
              }
              cur = reflectGetProto(cur);
            }
            return reflectSetProto(target, v);
          }
        },
        traps
      );
      proxyRef = new Proxy(TargetCtor, fullTraps);
      return markNative(proxyRef, label);
    }

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

    // Cache last resolved UTC minute bucket so tight Date loops run at native speed without ICU allocations
    let cachedMinuteKey = NaN;
    let cachedMinuteBase = null;

    function getTargetParts(epochMs) {
      if (Number.isNaN(epochMs) || !Number.isFinite(epochMs)) return null;
      const minuteKey = Math.floor(epochMs / 60000);
      if (minuteKey === cachedMinuteKey && cachedMinuteBase !== null) {
        const remMs = epochMs - minuteKey * 60000;
        const sec = Math.floor(remMs / 1000);
        const ms = remMs - sec * 1000;
        return {
          year: cachedMinuteBase.year,
          month: cachedMinuteBase.month,
          day: cachedMinuteBase.day,
          hour: cachedMinuteBase.hour,
          minute: cachedMinuteBase.minute,
          second: sec,
          ms,
          weekday: cachedMinuteBase.weekday,
          weekdayStr: cachedMinuteBase.weekdayStr,
          offsetSec: cachedMinuteBase.offsetSec,
          offsetMin: cachedMinuteBase.offsetMin
        };
      }
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
      const offsetMin = Math.trunc(offsetSec / 60);
      const normalizedOffsetMin = offsetMin === 0 ? 0 : offsetMin;
      const weekday = WEEKDAYS[weekdayStr] ?? 0;
      // Only cache standard whole-minute offset zones (non-LMT historical seconds)
      if (offsetSec % 60 === 0 && year >= 1900) {
        cachedMinuteKey = minuteKey;
        cachedMinuteBase = {
          year,
          month,
          day,
          hour,
          minute,
          weekday,
          weekdayStr,
          offsetSec,
          offsetMin: normalizedOffsetMin
        };
      }
      return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        ms,
        weekday,
        weekdayStr,
        offsetSec,
        offsetMin: normalizedOffsetMin
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

    function resolveLocaleArg(locales, realmGetCanonicalLocales) {
      if (!SPOOF_LANG) return locales;
      if (locales === undefined) return TARGET_LOCALE;
      const canonicalize = realmGetCanonicalLocales || RootGetCanonicalLocales;
      const canon = canonicalize(locales);
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

    const WORKER_BOOTSTRAP_SNIPPET = `(${installEnv.toString()})(${JSON.stringify({
      tz: TARGET_TZ,
      locale: TARGET_LOCALE,
      languages: RAW_LANGS,
      spoofLang: SPOOF_LANG
    })});\n`;

    function patchNavigatorProto(NavProto, realmLanguages, RealmObject, RealmError) {
      if (!NavProto) return;
      const realmDefine = RealmObject.defineProperty;
      const realmGetOwnDesc = RealmObject.getOwnPropertyDescriptor;

      const langDesc = realmGetOwnDesc(NavProto, 'language');
      if (langDesc && langDesc.get && langDesc.configurable) {
        const origLangGet = langDesc.get;
        const getLang = makeGetter('language', function () {
          // C++ Blink WebIDL brand check: throws genuine `TypeError: Illegal invocation` on Navigator.prototype or fake objects!
          origLangGet.call(this);
          return TARGET_LOCALE;
        }, RealmObject, RealmError);
        realmDefine(NavProto, 'language', {
          get: getLang,
          set: undefined,
          enumerable: Boolean(langDesc.enumerable),
          configurable: true
        });
      }

      const langsDesc = realmGetOwnDesc(NavProto, 'languages');
      if (langsDesc && langsDesc.get && langsDesc.configurable) {
        const origLangsGet = langsDesc.get;
        const getLangs = makeGetter('languages', function () {
          origLangsGet.call(this);
          return realmLanguages;
        }, RealmObject, RealmError);
        realmDefine(NavProto, 'languages', {
          get: getLangs,
          set: undefined,
          enumerable: Boolean(langsDesc.enumerable),
          configurable: true
        });
      }
    }

    const sharedBridge = { patchRealm };

    function patchRealm(win) {
      if (!win || (typeof win !== 'object' && typeof win !== 'function')) return;
      if (patchedRealms.has(win)) return;

      let OrigDate, OrigIntl, OrigFnProto, RealmObject, RealmError, RealmTypeError, RealmNumber;
      try {
        OrigDate = win.Date;
        OrigIntl = win.Intl;
        OrigFnProto = (win.Function && win.Function.prototype) ||
          (typeof OrigDate === 'function' ? reflectGetProto(OrigDate) : null);
        RealmObject = win.Object || (OrigIntl ? reflectGetProto(OrigIntl).constructor : Object);
        RealmError = win.Error || RootError;
        RealmTypeError = win.TypeError || TypeError;
        RealmNumber = win.Number || Number;
        if (typeof OrigDate !== 'function' || !OrigIntl || !OrigFnProto) return;
      } catch (_) {
        return;
      }

      patchedRealms.add(win);

      const realmDefine = RealmObject.defineProperty;
      const realmGetOwnDesc = RealmObject.getOwnPropertyDescriptor;
      const realmGetCanonicalLocales = typeof OrigIntl.getCanonicalLocales === 'function'
        ? OrigIntl.getCanonicalLocales
        : RootGetCanonicalLocales;

      // 1. Function.prototype.toString (also serves as capability-gated same-origin realm bridge)
      const OrigFnToString = OrigFnProto.toString;
      const patchedFnToString = makeMethod('toString', 0, function () {
        if (this === REALM_BRIDGE_TOKEN) {
          return sharedBridge;
        }
        if (typeof this === 'function' && nativeSourceMap.has(this)) {
          return nativeSourceMap.get(this);
        }
        return reflectApply(OrigFnToString, this, []);
      }, RealmObject, RealmError);

      realmDefine(OrigFnProto, 'toString', {
        value: patchedFnToString,
        writable: true,
        enumerable: false,
        configurable: true
      });

      // 2. Date & Date.prototype (calling each method's OWN original C++ builtin first so invalid `this`
      // throws with exact `at Date.<methodName> (<anonymous>)` top stack frame!)
      const proto = OrigDate.prototype;
      const origGetTime = proto.getTime;
      const origSetTime = proto.setTime;
      const origGetTimezoneOffset = proto.getTimezoneOffset;
      const origGetFullYear = proto.getFullYear;
      const origGetYear = proto.getYear;
      const origGetMonth = proto.getMonth;
      const origGetDate = proto.getDate;
      const origGetDay = proto.getDay;
      const origGetHours = proto.getHours;
      const origGetMinutes = proto.getMinutes;
      const origGetSeconds = proto.getSeconds;
      const origToString = proto.toString;
      const origToDateString = proto.toDateString;
      const origToTimeString = proto.toTimeString;
      const origToLocaleString = proto.toLocaleString;
      const origToLocaleDateString = proto.toLocaleDateString;
      const origToLocaleTimeString = proto.toLocaleTimeString;
      const origSetHours = proto.setHours;
      const origSetMinutes = proto.setMinutes;
      const origSetSeconds = proto.setSeconds;
      const origSetDate = proto.setDate;
      const origSetMonth = proto.setMonth;
      const origSetFullYear = proto.setFullYear;
      const origSetYear = proto.setYear;

      const origDateParse = OrigDate.parse;
      const patchProtoMethod = (targetProto, name, arity, impl) => {
        if (!targetProto) return;
        const fn = makeMethod(name, arity, impl, RealmObject, RealmError);
        realmDefine(targetProto, name, {
          value: fn,
          writable: true,
          enumerable: false,
          configurable: true
        });
      };

      const isDateObj = (v) => {
        if (!v || typeof v !== 'object') return false;
        try {
          origGetTime.call(v);
          return true;
        } catch (_) {
          return false;
        }
      };

      patchProtoMethod(proto, 'getTimezoneOffset', 0, function () {
        origGetTimezoneOffset.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.offsetMin : NaN;
      });
      patchProtoMethod(proto, 'getFullYear', 0, function () {
        origGetFullYear.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.year : NaN;
      });
      if (typeof origGetYear === 'function') {
        patchProtoMethod(proto, 'getYear', 0, function () {
          origGetYear.call(this);
          const p = getTargetParts(origGetTime.call(this));
          return p ? p.year - 1900 : NaN;
        });
      }
      patchProtoMethod(proto, 'getMonth', 0, function () {
        origGetMonth.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.month : NaN;
      });
      patchProtoMethod(proto, 'getDate', 0, function () {
        origGetDate.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.day : NaN;
      });
      patchProtoMethod(proto, 'getDay', 0, function () {
        origGetDay.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.weekday : NaN;
      });
      patchProtoMethod(proto, 'getHours', 0, function () {
        origGetHours.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.hour : NaN;
      });
      patchProtoMethod(proto, 'getMinutes', 0, function () {
        origGetMinutes.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.minute : NaN;
      });
      patchProtoMethod(proto, 'getSeconds', 0, function () {
        origGetSeconds.call(this);
        const p = getTargetParts(origGetTime.call(this));
        return p ? p.second : NaN;
      });
      patchProtoMethod(proto, 'toString', 0, function () {
        origToString.call(this);
        return formatFullString(origGetTime.call(this));
      });
      patchProtoMethod(proto, 'toDateString', 0, function () {
        origToDateString.call(this);
        return formatDateString(origGetTime.call(this));
      });
      patchProtoMethod(proto, 'toTimeString', 0, function () {
        origToTimeString.call(this);
        return formatTimeString(origGetTime.call(this));
      });

      patchProtoMethod(proto, 'toLocaleString', 0, function (locales, options) {
        if (!isDateObj(this)) return origToLocaleString.call(this, locales, options);
        return origToLocaleString.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options));
      });
      patchProtoMethod(proto, 'toLocaleDateString', 0, function (locales, options) {
        if (!isDateObj(this)) return origToLocaleDateString.call(this, locales, options);
        return origToLocaleDateString.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options));
      });
      patchProtoMethod(proto, 'toLocaleTimeString', 0, function (locales, options) {
        if (!isDateObj(this)) return origToLocaleTimeString.call(this, locales, options);
        return origToLocaleTimeString.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options));
      });

      patchProtoMethod(proto, 'setHours', 4, function (h, m, s, ms) {
        if (!isDateObj(this)) return reflectApply(origSetHours, this, arguments);
        if (arguments.length === 0) return origSetTime.call(this, NaN);
        const p = getTargetParts(origGetTime.call(this));
        if (!p) return NaN;
        const epoch = localComponentsToEpoch(
          p.year, p.month, p.day,
          +h,
          arguments.length > 1 ? +m : p.minute,
          arguments.length > 2 ? +s : p.second,
          arguments.length > 3 ? +ms : p.ms
        );
        return origSetTime.call(this, epoch);
      });
      patchProtoMethod(proto, 'setMinutes', 3, function (m, s, ms) {
        if (!isDateObj(this)) return reflectApply(origSetMinutes, this, arguments);
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
        if (!isDateObj(this)) return reflectApply(origSetSeconds, this, arguments);
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
        if (!isDateObj(this)) return reflectApply(origSetDate, this, arguments);
        if (arguments.length === 0) return origSetTime.call(this, NaN);
        const p = getTargetParts(origGetTime.call(this));
        if (!p) return NaN;
        const epoch = localComponentsToEpoch(p.year, p.month, +d, p.hour, p.minute, p.second, p.ms);
        return origSetTime.call(this, epoch);
      });
      patchProtoMethod(proto, 'setMonth', 2, function (mo, d) {
        if (!isDateObj(this)) return reflectApply(origSetMonth, this, arguments);
        if (arguments.length === 0) return origSetTime.call(this, NaN);
        const p = getTargetParts(origGetTime.call(this));
        if (!p) return NaN;
        const epoch = localComponentsToEpoch(
          p.year, +mo,
          arguments.length > 1 ? +d : p.day,
          p.hour, p.minute, p.second, p.ms
        );
        return origSetTime.call(this, epoch);
      });
      patchProtoMethod(proto, 'setFullYear', 3, function (y, mo, d) {
        if (!isDateObj(this)) return reflectApply(origSetFullYear, this, arguments);
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
      if (typeof origSetYear === 'function') {
        patchProtoMethod(proto, 'setYear', 1, function (y) {
          if (!isDateObj(this)) return reflectApply(origSetYear, this, arguments);
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
      }

      const DateProxy = makeSafeProxy(OrigDate, 'Date', {
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
            let fullY = RealmNumber(y);
            const numMo = RealmNumber(mo);
            const numD = args.length > 2 ? RealmNumber(d) : 1;
            const numH = args.length > 3 ? RealmNumber(h) : 0;
            const numMn = args.length > 4 ? RealmNumber(mn) : 0;
            const numS = args.length > 5 ? RealmNumber(s) : 0;
            const numMs = args.length > 6 ? RealmNumber(ms) : 0;
            if (!Number.isNaN(fullY)) {
              const truncY = Math.trunc(fullY);
              if (truncY >= 0 && truncY <= 99) fullY = 1900 + truncY;
            }
            const epoch = localComponentsToEpoch(fullY, numMo, numD, numH, numMn, numS, numMs);
            return reflectConstruct(target, [epoch], newTarget);
          } catch (e) {
            throw cleanErrorStack(e, RealmObject, RealmError);
          }
        }
      }, RealmObject, RealmError);

      const parseMethod = makeMethod('parse', 1, function (str) {
        if (typeof str === 'symbol') {
          return origDateParse(str);
        }
        return parseInTargetTz(String(str));
      }, RealmObject, RealmError);
      realmDefine(DateProxy, 'parse', { value: parseMethod, writable: true, enumerable: false, configurable: true });
      realmDefine(proto, 'constructor', { value: DateProxy, writable: true, enumerable: false, configurable: true });
      realmDefine(win, 'Date', { value: DateProxy, writable: true, enumerable: false, configurable: true });

      // 3. Intl.DateTimeFormat (using reflectApply in `apply` to preserve legacy ChainDateTimeFormat!)
      const OrigDTF = OrigIntl.DateTimeFormat;
      const DTFProxy = makeSafeProxy(OrigDTF, 'DateTimeFormat', {
        apply(target, thisArg, args) {
          try {
            const [locales, options] = args;
            return reflectApply(target, thisArg, [resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options)]);
          } catch (e) {
            throw cleanErrorStack(e, RealmObject, RealmError);
          }
        },
        construct(target, args, newTarget) {
          try {
            const [locales, options] = args;
            return reflectConstruct(target, [resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options)], newTarget);
          } catch (e) {
            throw cleanErrorStack(e, RealmObject, RealmError);
          }
        }
      }, RealmObject, RealmError);
      realmDefine(OrigDTF.prototype, 'constructor', { value: DTFProxy, writable: true, enumerable: false, configurable: true });
      realmDefine(OrigIntl, 'DateTimeFormat', { value: DTFProxy, writable: true, enumerable: false, configurable: true });

      // 4. TC39 Temporal API
      const RealmTemporal = win.Temporal;
      if (RealmTemporal && RealmTemporal.Now) {
        const tNow = RealmTemporal.Now;
        if (typeof tNow.timeZoneId === 'function') {
          const tzIdFn = makeMethod('timeZoneId', 0, function () {
            return TARGET_TZ;
          }, RealmObject, RealmError);
          realmDefine(tNow, 'timeZoneId', { value: tzIdFn, writable: true, enumerable: false, configurable: true });
        }

        for (const methodName of ['zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO']) {
          const origMethod = tNow[methodName];
          if (typeof origMethod === 'function') {
            const wrapped = makeMethod(methodName, 0, function () {
              const tzArg = arguments[0] === undefined ? TARGET_TZ : arguments[0];
              return origMethod.call(this, tzArg);
            }, RealmObject, RealmError);
            realmDefine(tNow, methodName, { value: wrapped, writable: true, enumerable: false, configurable: true });
          }
        }

        if (RealmTemporal.Instant && RealmTemporal.Instant.prototype && typeof RealmTemporal.Instant.prototype.toLocaleString === 'function') {
          const origInstTls = RealmTemporal.Instant.prototype.toLocaleString;
          patchProtoMethod(RealmTemporal.Instant.prototype, 'toLocaleString', 0, function (locales, options) {
            return origInstTls.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), withTzOptions(options));
          });
        }
      }

      // 5. Language & Locale overrides (Window Navigator + WorkerNavigator + Intl + SpeechSynthesis)
      if (SPOOF_LANG) {
        const realmLanguages = RealmObject.freeze((win.Array ? win.Array.from(RAW_LANGS) : RAW_LANGS.slice()));

        const wrapIntlCtor = (name) => {
          const OrigCtor = OrigIntl[name];
          if (typeof OrigCtor !== 'function') return;
          const p = makeSafeProxy(OrigCtor, name, {
            apply(target, thisArg, args) {
              try {
                // Calling reflectApply preserves legacy chaining on NumberFormat/Collator AND throws genuine
                // `TypeError: Constructor Intl.PluralRules requires 'new'` on modern Intl constructors!
                const [locales, options] = args;
                return reflectApply(target, thisArg, [resolveLocaleArg(locales, realmGetCanonicalLocales), options]);
              } catch (e) {
                throw cleanErrorStack(e, RealmObject, RealmError);
              }
            },
            construct(target, args, newTarget) {
              try {
                const [locales, options] = args;
                return reflectConstruct(target, [resolveLocaleArg(locales, realmGetCanonicalLocales), options], newTarget);
              } catch (e) {
                throw cleanErrorStack(e, RealmObject, RealmError);
              }
            }
          }, RealmObject, RealmError);
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
            return origNumTls.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), options);
          });
        }

        if (win.BigInt && win.BigInt.prototype && typeof win.BigInt.prototype.toLocaleString === 'function') {
          const origBigTls = win.BigInt.prototype.toLocaleString;
          patchProtoMethod(win.BigInt.prototype, 'toLocaleString', 0, function (locales, options) {
            return origBigTls.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), options);
          });
        }

        if (win.String && win.String.prototype && typeof win.String.prototype.localeCompare === 'function') {
          const origLocaleCompare = win.String.prototype.localeCompare;
          patchProtoMethod(win.String.prototype, 'localeCompare', 1, function (that, locales, options) {
            if (this === null || this === undefined) {
              return origLocaleCompare.call(this, that, locales, options);
            }
            return origLocaleCompare.call(this, that, resolveLocaleArg(locales, realmGetCanonicalLocales), options);
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
                return origTls.call(this, resolveLocaleArg(locales, realmGetCanonicalLocales), options);
              });
            }
          }
        }

        // Patch BOTH Window Navigator.prototype AND Worker WorkerNavigator.prototype with C++ brand validation!
        if (win.Navigator && win.Navigator.prototype) {
          patchNavigatorProto(win.Navigator.prototype, realmLanguages, RealmObject, RealmError);
        }
        if (win.WorkerNavigator && win.WorkerNavigator.prototype) {
          patchNavigatorProto(win.WorkerNavigator.prototype, realmLanguages, RealmObject, RealmError);
        }

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
                const rawVal = origGetter.call(this);
                const ov = voiceOverrides.get(this);
                if (ov && prop in ov) return ov[prop];
                return rawVal;
              }, RealmObject, RealmError);
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

      // 6. Dedicated & Shared Web Worker synchronization (blob: & data: workers)
      const RealmURL = win.URL;
      const RealmBlob = win.Blob;
      const origSetTimeout = typeof win.setTimeout === 'function' ? win.setTimeout : null;
      const origCreateObjectURL = RealmURL && typeof RealmURL.createObjectURL === 'function'
        ? RealmURL.createObjectURL
        : null;
      const origRevokeObjectURL = RealmURL && typeof RealmURL.revokeObjectURL === 'function'
        ? RealmURL.revokeObjectURL
        : null;

      if (origCreateObjectURL && RealmBlob) {
        const realmBlobSizeGet = RealmBlob.prototype
          ? realmGetOwnDesc(RealmBlob.prototype, 'size')?.get
          : null;
        if (realmBlobSizeGet) blobSizeGetters.add(realmBlobSizeGet);
        const createDesc = realmGetOwnDesc(RealmURL, 'createObjectURL');
        if (!createDesc || createDesc.configurable) {
          const wrappedCreateObjUrl = makeMethod('createObjectURL', 1, function (obj) {
            const url = reflectApply(origCreateObjectURL, this, arguments);
            // Brand-check via C++ Blob.prototype.size so Blobs created in child iframes are tracked too!
            if (typeof url === 'string' && isGenuineBlob(obj)) {
              trackedBlobs.set(url, obj);
            }
            return url;
          }, RealmObject, RealmError);
          realmDefine(RealmURL, 'createObjectURL', {
            value: wrappedCreateObjUrl,
            writable: true,
            enumerable: Boolean(createDesc ? createDesc.enumerable : true),
            configurable: true
          });
        }

        if (origRevokeObjectURL) {
          const revokeDesc = realmGetOwnDesc(RealmURL, 'revokeObjectURL');
          if (!revokeDesc || revokeDesc.configurable) {
            const wrappedRevokeObjUrl = makeMethod('revokeObjectURL', 1, function (url) {
              trackedBlobs.delete(String(url));
              return reflectApply(origRevokeObjectURL, this, arguments);
            }, RealmObject, RealmError);
            realmDefine(RealmURL, 'revokeObjectURL', {
              value: wrappedRevokeObjUrl,
              writable: true,
              enumerable: Boolean(revokeDesc ? revokeDesc.enumerable : true),
              configurable: true
            });
          }
        }

        const scheduleUrlCleanup = (urls) => {
          if (!origRevokeObjectURL || !origSetTimeout || !Array.isArray(urls) || urls.length === 0) return;
          try {
            origSetTimeout.call(win, () => {
              for (let i = 0; i < urls.length; i++) {
                try {
                  origRevokeObjectURL.call(RealmURL, urls[i]);
                } catch (_) {}
              }
            }, 20000);
          } catch (_) {}
        };

        const buildPatchedWorkerScript = (rawScriptUrl, options) => {
          if (typeof rawScriptUrl !== 'string' && !(rawScriptUrl && typeof rawScriptUrl === 'object')) {
            return null;
          }
          // Skip TrustedScriptURL objects so Trusted Types CSP never fires `securitypolicyviolation`
          if (win.TrustedScriptURL && rawScriptUrl instanceof win.TrustedScriptURL) {
            return null;
          }
          const urlStr = String(rawScriptUrl);
          const isModule = Boolean(options && typeof options === 'object' && options.type === 'module');

          // 1) blob: URL created via URL.createObjectURL (across any same-origin realm)
          //    Keep `origBlob` as its own separate compilation unit via a private unrevoked Blob URL:
          //    - Survives synchronous `URL.revokeObjectURL(urlStr)` right after `new Worker(urlStr)`!
          //    - Preserves `"use strict";` directive prologue & sloppy/strict semantics inside `origBlob`!
          //    - Keeps `SELF_STACK_MARKER` isolated to the outer bootstrap URL so worker stacks stay intact!
          if (urlStr.startsWith('blob:')) {
            const origBlob = trackedBlobs.get(urlStr);
            if (!origBlob) {
              return null;
            }
            const privateInnerUrl = origCreateObjectURL.call(RealmURL, origBlob);
            if (isModule) {
              const bootUrl = origCreateObjectURL.call(
                RealmURL,
                new RealmBlob([WORKER_BOOTSTRAP_SNIPPET], { type: 'text/javascript' })
              );
              const modLoader = `import ${JSON.stringify(bootUrl)};\nimport ${JSON.stringify(privateInnerUrl)};\n`;
              const outerUrl = origCreateObjectURL.call(
                RealmURL,
                new RealmBlob([modLoader], { type: 'text/javascript' })
              );
              return { outerUrl, cleanupUrls: [outerUrl, bootUrl, privateInnerUrl] };
            }
            const shim = `${WORKER_BOOTSTRAP_SNIPPET}try{importScripts(${JSON.stringify(privateInnerUrl)});}finally{try{URL.revokeObjectURL(${JSON.stringify(privateInnerUrl)});}catch(_){}}\n`;
            const outerUrl = origCreateObjectURL.call(
              RealmURL,
              new RealmBlob([shim], { type: 'application/javascript' })
            );
            return { outerUrl, cleanupUrls: [outerUrl, privateInnerUrl] };
          }

          // 2) data: URL worker
          if (urlStr.startsWith('data:')) {
            if (isModule) {
              const bootUrl = origCreateObjectURL.call(
                RealmURL,
                new RealmBlob([WORKER_BOOTSTRAP_SNIPPET], { type: 'text/javascript' })
              );
              const modLoader = `import ${JSON.stringify(bootUrl)};\nimport ${JSON.stringify(urlStr)};\n`;
              const outerUrl = origCreateObjectURL.call(
                RealmURL,
                new RealmBlob([modLoader], { type: 'text/javascript' })
              );
              return { outerUrl, cleanupUrls: [outerUrl, bootUrl] };
            }
            const shim = `${WORKER_BOOTSTRAP_SNIPPET}importScripts(${JSON.stringify(urlStr)});\n`;
            const outerUrl = origCreateObjectURL.call(
              RealmURL,
              new RealmBlob([shim], { type: 'application/javascript' })
            );
            return { outerUrl, cleanupUrls: [outerUrl] };
          }

          // Note: Do NOT rewrite http:/https: worker URLs to blob:, because:
          // - Strict `worker-src 'self'` / `script-src 'self'` CSP blocks blob: asynchronously
          //   (without throwing in `new Worker()`) and emits `securitypolicyviolation` events.
          // - Replacing https: with blob: breaks `self.location.pathname`, `self.location.search`,
          //   and relative fetch()/importScripts() inside the worker.
          return null;
        };

        const wrapWorkerCtor = (ctorName) => {
          const OrigWorkerCtor = win[ctorName];
          if (typeof OrigWorkerCtor !== 'function') return;
          const workerDesc = realmGetOwnDesc(win, ctorName);
          if (workerDesc && !workerDesc.configurable) return;

          const WorkerProxy = makeSafeProxy(OrigWorkerCtor, ctorName, {
            apply(target, thisArg, args) {
              try {
                return reflectApply(target, thisArg, args);
              } catch (e) {
                throw cleanErrorStack(e, RealmObject, RealmError);
              }
            },
            construct(target, args, newTarget) {
              try {
                if (args.length >= 1) {
                  let patched = null;
                  try {
                    patched = buildPatchedWorkerScript(args[0], args[1]);
                  } catch (_) {}
                  if (patched && patched.outerUrl) {
                    try {
                      const nextArgs = args.slice();
                      nextArgs[0] = patched.outerUrl;
                      const instance = reflectConstruct(target, nextArgs, newTarget);
                      scheduleUrlCleanup(patched.cleanupUrls);
                      return instance;
                    } catch (_) {
                      scheduleUrlCleanup(patched.cleanupUrls);
                    }
                  }
                }
                return reflectConstruct(target, args, newTarget);
              } catch (e) {
                throw cleanErrorStack(e, RealmObject, RealmError);
              }
            }
          }, RealmObject, RealmError);

          if (OrigWorkerCtor.prototype) {
            realmDefine(OrigWorkerCtor.prototype, 'constructor', {
              value: WorkerProxy,
              writable: true,
              enumerable: false,
              configurable: true
            });
          }
          realmDefine(win, ctorName, {
            value: WorkerProxy,
            writable: true,
            enumerable: false,
            configurable: true
          });
        };

        wrapWorkerCtor('Worker');
        wrapWorkerCtor('SharedWorker');
      }

      // 7. Synchronously patch same-origin iframes (contentWindow, contentDocument, window[0] on DOM insertion, window.open)
      const origIframeCwGet = win.HTMLIFrameElement?.prototype
        ? realmGetOwnDesc(win.HTMLIFrameElement.prototype, 'contentWindow')?.get
        : null;
      const origFrameCwGet = win.HTMLFrameElement?.prototype
        ? realmGetOwnDesc(win.HTMLFrameElement.prototype, 'contentWindow')?.get
        : null;

      const patchSingleFrameEl = (el) => {
        if (!el || typeof el !== 'object') return;
        try {
          if (origIframeCwGet) {
            try {
              const cw = origIframeCwGet.call(el);
              if (cw) {
                patchRealm(cw);
                return;
              }
            } catch (_) {}
          }
          if (origFrameCwGet) {
            try {
              const cw = origFrameCwGet.call(el);
              if (cw) patchRealm(cw);
            } catch (_) {}
          }
        } catch (_) {}
      };

      const collectFragmentFrames = (node) => {
        if (!node || typeof node !== 'object') return null;
        try {
          if (node.nodeType === 11 && typeof node.querySelectorAll === 'function') {
            const found = node.querySelectorAll('iframe, frame');
            return found && found.length > 0 ? Array.from(found) : null;
          }
        } catch (_) {}
        return null;
      };

      const patchNodeFrames = (node, preCollected) => {
        if (preCollected) {
          for (let i = 0; i < preCollected.length; i++) {
            patchSingleFrameEl(preCollected[i]);
          }
          return;
        }
        if (!node || typeof node !== 'object') return;
        patchSingleFrameEl(node);
        try {
          if (typeof node.getElementsByTagName === 'function') {
            if (origIframeCwGet) {
              const list = node.getElementsByTagName('iframe');
              for (let i = 0; i < list.length; i++) {
                patchSingleFrameEl(list[i]);
              }
            }
            if (origFrameCwGet) {
              const fList = node.getElementsByTagName('frame');
              for (let i = 0; i < fList.length; i++) {
                patchSingleFrameEl(fList[i]);
              }
            }
          }
        } catch (_) {}
      };

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
          }, RealmObject, RealmError);
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
          }, RealmObject, RealmError);
          realmDefine(fp, 'contentDocument', {
            get: getCd,
            set: undefined,
            enumerable: Boolean(cdDesc.enumerable),
            configurable: true
          });
        }
      };

      hookFrameOwnerProto(win.HTMLIFrameElement);
      hookFrameOwnerProto(win.HTMLFrameElement);
      hookFrameOwnerProto(win.HTMLObjectElement);

      // Cover `window[0]` indexed subframe access immediately upon DOM insertion (`appendChild`, `insertBefore`, `innerHTML`, etc.)
      if (win.Node && win.Node.prototype && origIframeCwGet) {
        const np = win.Node.prototype;
        for (const [mName, arity] of [['appendChild', 1], ['insertBefore', 2], ['replaceChild', 2]]) {
          const desc = realmGetOwnDesc(np, mName);
          if (desc && typeof desc.value === 'function' && desc.configurable) {
            const origDomFn = desc.value;
            const wrapped = makeMethod(mName, arity, function () {
              const pre = collectFragmentFrames(arguments[0]);
              const res = reflectApply(origDomFn, this, arguments);
              patchNodeFrames(arguments[0], pre);
              return res;
            }, RealmObject, RealmError);
            realmDefine(np, mName, {
              value: wrapped,
              writable: Boolean(desc.writable),
              enumerable: Boolean(desc.enumerable),
              configurable: true
            });
          }
        }
      }

      if (win.Element && win.Element.prototype && origIframeCwGet) {
        const ep = win.Element.prototype;
        for (const [mName, arity] of [['append', 0], ['prepend', 0], ['after', 0], ['before', 0], ['replaceWith', 0], ['insertAdjacentElement', 2], ['insertAdjacentHTML', 2]]) {
          const desc = realmGetOwnDesc(ep, mName);
          if (desc && typeof desc.value === 'function' && desc.configurable) {
            const origElFn = desc.value;
            const wrapped = makeMethod(mName, arity, function () {
              let preList = null;
              if (mName !== 'insertAdjacentHTML' && arguments.length > 0) {
                for (let i = 0; i < arguments.length; i++) {
                  const cf = collectFragmentFrames(arguments[i]);
                  if (cf) preList = preList ? preList.concat(cf) : cf;
                }
              }
              const res = reflectApply(origElFn, this, arguments);
              if (mName === 'insertAdjacentHTML') {
                patchNodeFrames(this, null);
              } else {
                if (preList) patchNodeFrames(null, preList);
                for (let i = 0; i < arguments.length; i++) {
                  patchNodeFrames(arguments[i], null);
                }
              }
              return res;
            }, RealmObject, RealmError);
            realmDefine(ep, mName, {
              value: wrapped,
              writable: Boolean(desc.writable),
              enumerable: Boolean(desc.enumerable),
              configurable: true
            });
          }
        }

        const ihDesc = realmGetOwnDesc(ep, 'innerHTML');
        if (ihDesc && ihDesc.set && ihDesc.configurable) {
          const origIhSet = ihDesc.set;
          const setIh = makeSetter('innerHTML', function (val) {
            const res = origIhSet.call(this, val);
            patchNodeFrames(this, null);
            return res;
          }, RealmObject, RealmError);
          realmDefine(ep, 'innerHTML', {
            get: ihDesc.get,
            set: setIh,
            enumerable: Boolean(ihDesc.enumerable),
            configurable: true
          });
        }
      }

      // Cover `window.open('')` synchronous blank popup realms
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
          }, RealmObject, RealmError);
          realmDefine(openTarget, 'open', {
            value: wrappedOpen,
            writable: Boolean(openDesc.writable),
            enumerable: Boolean(openDesc.enumerable),
            configurable: true
          });
        }
      } catch (_) {}
    }

    patchRealm(envRoot);
  }

  installEnv(initialCfg);
})();
