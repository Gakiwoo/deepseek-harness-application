"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid2 = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module2.exports = valid2;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare2 = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare2;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var rcompare = (a, b, loose) => compare2(b, a, loose);
    module2.exports = rcompare;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var compareLoose = (a, b) => compare2(a, b, true);
    module2.exports = compareLoose;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var gt = (a, b, loose) => compare2(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var lt = (a, b, loose) => compare2(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var eq = (a, b, loose) => compare2(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var neq = (a, b, loose) => compare2(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var gte = (a, b, loose) => compare2(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare2 = require_compare();
    var lte = (a, b, loose) => compare2(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/truncate.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module2.exports = truncate;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module2.exports = gtr;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module2.exports = ltr;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare2 = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare2(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare2 = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare2(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare2(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare2(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid2 = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare2 = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid: valid2,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare: compare2,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// src/main.ts
var import_node_crypto3 = require("node:crypto");
var import_node_child_process3 = require("node:child_process");
var import_electron4 = require("electron");
var import_node_path7 = require("node:path");
var import_node_url = require("node:url");

// ../../packages/util/home-paths/lib/index.js
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var DSH_HOME_DIR_NAME = ".dsh";
var DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
var DSH_HOME_ENV = "DSH_HOME";
function defaultDshHome() {
  return (0, import_node_path.join)((0, import_node_os.homedir)(), DSH_HOME_DIR_NAME);
}
function expandHomePath(path) {
  if (path === "~") return (0, import_node_os.homedir)();
  if (path.startsWith("~/") || path.startsWith("~\\")) return (0, import_node_path.join)((0, import_node_os.homedir)(), path.slice(2));
  return path;
}
function resolveDshHome(configured, env = process.env) {
  const fromEnv = env[DSH_HOME_ENV];
  return (0, import_node_path.resolve)(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}

// src/lifecycle.ts
var DESKTOP_SHUTDOWN_TIMEOUT_MS = 5e3;
async function disposeDesktopShell(resources) {
  resources.pump?.dispose();
  try {
    await resources.host?.dispose();
  } finally {
    resources.native?.dispose();
    await resources.updater?.applyPending();
  }
}
function createDesktopShutdown(dispose, exit, timeoutMs = DESKTOP_SHUTDOWN_TIMEOUT_MS) {
  let pending;
  let exited = false;
  const exitOnce = (code) => {
    if (exited) return;
    exited = true;
    exit(code);
  };
  return {
    request(code, requestTimeoutMs = timeoutMs) {
      if (pending !== void 0) {
        exitOnce(code);
        return pending;
      }
      pending = new Promise((resolve2) => {
        const timeout = setTimeout(() => {
          exitOnce(code === 0 ? 1 : code);
          resolve2();
        }, requestTimeoutMs);
        void dispose().then(
          () => {
            clearTimeout(timeout);
            exitOnce(code);
            resolve2();
          },
          () => {
            clearTimeout(timeout);
            exitOnce(code === 0 ? 1 : code);
            resolve2();
          }
        );
      });
      return pending;
    },
    isPending: () => pending !== void 0
  };
}
function installShutdownRequests(signals, nativeApp, requestQuit) {
  const onInterrupt = () => {
    requestQuit(130);
  };
  const onTerminate = () => {
    requestQuit(0);
  };
  const onBeforeQuit = (event) => {
    event.preventDefault();
    requestQuit(0);
  };
  signals.on("SIGINT", onInterrupt);
  signals.on("SIGTERM", onTerminate);
  nativeApp.on("before-quit", onBeforeQuit);
  return () => {
    signals.off("SIGINT", onInterrupt);
    signals.off("SIGTERM", onTerminate);
    nativeApp.off("before-quit", onBeforeQuit);
  };
}

// src/protocol.ts
var import_node_fs = require("node:fs");
var import_electron = require("electron");

// ../../packages/client/modules/lib/index.js
function injectBootManifest(html, graph) {
  const script = `<script>window.__DSH_BOOT__ = ${JSON.stringify(graph).replaceAll("<", "\\u003c")}</script>`;
  const head = html.indexOf("<head>");
  if (head !== -1) return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`;
  return `${script}${html}`;
}

// src/protocol.ts
var CSP = "default-src 'self'; script-src 'self'; connect-src 'self'";
function registerDshScheme() {
  import_electron.protocol.registerSchemesAsPrivileged([{
    scheme: "dsh",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }]);
}
function mountDshProtocol(runtime) {
  import_electron.protocol.handle("dsh", (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/" || path === "/index.html") {
      const html = (0, import_node_fs.readFileSync)(runtime.frontendIndex(), "utf8");
      return new Response(injectBootManifest(html, runtime.graph()), {
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP }
      });
    }
    const pluginsPrefix = "/plugins/";
    if (path.startsWith(pluginsPrefix) && path.endsWith("/client.js")) {
      const id = path.slice(pluginsPrefix.length, -"/client.js".length);
      const clientPath = runtime.clientPath(id);
      if (clientPath === void 0) return new Response("not found", { status: 404 });
      return import_electron.net.fetch(`file://${clientPath}`);
    }
    const dir = runtime.frontendIndex().slice(0, runtime.frontendIndex().lastIndexOf("/"));
    return import_electron.net.fetch(`file://${dir}${path}`);
  });
}

// src/crash-evidence.ts
var import_node_fs2 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path2 = require("node:path");
function collectEnvironmentFacts(options) {
  const runtime = options.versions ?? process.versions;
  return {
    appVersion: options.appVersion,
    ...runtime.electron !== void 0 ? { electronVersion: runtime.electron } : {},
    ...runtime.chrome !== void 0 ? { chromeVersion: runtime.chrome } : {},
    nodeVersion: runtime.node ?? "",
    platform: options.platform,
    arch: options.arch,
    packaged: options.packaged,
    uptimeMs: options.uptimeMs ?? Math.round(process.uptime() * 1e3),
    home: (0, import_node_os2.homedir)(),
    dshHome: resolveDshHome(void 0, options.env),
    path: options.env.PATH ?? ""
  };
}
function buildCrashEvidence(options) {
  return {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    reason: options.reason,
    ...options.detail !== void 0 ? { detail: options.detail } : {},
    ...collectEnvironmentFacts(options)
  };
}
function crashEvidenceDir(env = process.env) {
  return (0, import_node_path2.join)(resolveDshHome(void 0, env), "diagnostics");
}
function writeCrashEvidence(dir, evidence) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path2.join)(dir, `crash-${evidence.at.replace(/[:.]/g, "-")}.json`);
  (0, import_node_fs2.writeFileSync)(file, `${JSON.stringify(evidence, null, 2)}
`);
  return file;
}

// src/diagnostics-export.ts
var import_node_child_process = require("node:child_process");
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
var ARCHIVE_MEMBERS = ["diagnostics", "sessions"];
function collectDiagnosticsFacts(options, sessionsDir) {
  return {
    ...collectEnvironmentFacts(options),
    sessionLogs: listSessionLogs(sessionsDir)
  };
}
async function exportDiagnosticsArchive(home, facts, spawnChild = (argv) => (0, import_node_child_process.spawn)("tar", argv, { stdio: ["ignore", "pipe", "ignore"] })) {
  const diagnosticsDir = (0, import_node_path3.join)(home, "diagnostics");
  (0, import_node_fs3.mkdirSync)(diagnosticsDir, { recursive: true });
  (0, import_node_fs3.writeFileSync)((0, import_node_path3.join)(diagnosticsDir, "export-facts.json"), `${JSON.stringify(facts, null, 2)}
`);
  const members = ARCHIVE_MEMBERS.filter((member) => (0, import_node_fs3.existsSync)((0, import_node_path3.join)(home, member)));
  const outputDir = (0, import_node_path3.join)(home, "exports");
  (0, import_node_fs3.mkdirSync)(outputDir, { recursive: true });
  const output = (0, import_node_path3.join)(outputDir, `diagnostics-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.tar.gz`);
  const code = await waitForExit(spawnChild(["-czf", output, "-C", home, ...members]));
  if (code !== 0) {
    throw new Error(`tar exited with code ${String(code)} while creating the diagnostics archive`);
  }
  return output;
}
function waitForExit(child) {
  return new Promise((resolve2, reject) => {
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve2(code);
    });
  });
}
function listSessionLogs(root) {
  if (!(0, import_node_fs3.existsSync)(root)) return [];
  try {
    return (0, import_node_fs3.readdirSync)(root, { recursive: true, encoding: "utf8" }).sort();
  } catch {
    return [];
  }
}

// src/shell-environment.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");
var SHELL_FILL_ALLOWLIST = /* @__PURE__ */ new Set([
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_COLLATE",
  "LC_MESSAGES",
  "LC_NUMERIC",
  "LC_MONETARY",
  "LC_PAPER",
  "LC_TIME",
  "LC_IDENTIFICATION",
  "TZ",
  "NVM_DIR",
  "NVM_BIN",
  "RUSTUP_HOME",
  "CARGO_HOME",
  "GOPATH",
  "PYENV_ROOT",
  "CONDA_HOME",
  "CONDA_PREFIX",
  "VIRTUAL_ENV",
  "ASDF_DATA_DIR",
  "MISE_DATA_DIR",
  "SDKMAN_DIR",
  "PNPM_HOME",
  "COREPACK_HOME",
  "NPM_CONFIG_PREFIX",
  "YARN_CACHE_FOLDER"
]);
var SUPPORTED_SHELL_BASENAMES = ["zsh", "bash"];
var FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash"];
var DEFAULT_TIMEOUT_MS = 2e3;
var DEFAULT_MAX_BYTES = 64 * 1024;
function parseExportOutput(raw) {
  const env = /* @__PURE__ */ new Map();
  for (const line of raw.split("\n")) {
    const match = /^(?:declare -x |export |typeset -x )?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match === null) continue;
    env.set(match[1], unquoteExportValue(match[2]));
  }
  return env;
}
function resolveShellPath(shell2, shellExists = import_node_fs4.existsSync) {
  if (shell2 !== void 0 && SUPPORTED_SHELL_BASENAMES.includes((0, import_node_path4.basename)(shell2)) && shellExists(shell2)) {
    return shell2;
  }
  return FALLBACK_SHELLS.find(shellExists);
}
async function captureExportOutput(options) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const child = options.spawnChild === void 0 ? (0, import_node_child_process2.spawn)(options.shell, ["-ilc", "export -p"], { stdio: ["ignore", "pipe", "ignore"] }) : options.spawnChild(options.shell, ["-ilc", "export -p"]);
  return await new Promise((resolve2) => {
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve2(void 0);
    }, timeoutMs);
    const finish = (env) => {
      clearTimeout(timer);
      resolve2(env);
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > maxBytes) {
        child.kill();
        finish(parseExportOutput(stdout.slice(0, maxBytes)));
      }
    });
    child.stdout?.on("error", () => {
      finish(void 0);
    });
    child.on("error", () => {
      finish(void 0);
    });
    child.on("close", (code) => {
      if (code === 0) finish(parseExportOutput(stdout));
      else finish(void 0);
    });
  });
}
async function recoverShellEnvironment(options) {
  if (!options.enabled) return [];
  const shell2 = resolveShellPath(options.shell, options.shellExists);
  if (shell2 === void 0) return [];
  const captured = await captureExportOutput({
    shell: shell2,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    spawnChild: options.spawnChild
  });
  if (captured === void 0) return [];
  const target = options.target ?? process.env;
  const imported = [];
  const shellPath = captured.get("PATH");
  if (shellPath !== void 0 && shellPath !== "") {
    target.PATH = shellPath;
    imported.push("PATH");
  }
  for (const name of SHELL_FILL_ALLOWLIST) {
    const value = captured.get(name);
    if (value !== void 0 && target[name] === void 0) {
      target[name] = value;
      imported.push(name);
    }
  }
  return imported.sort();
}
function unquoteExportValue(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1);
  }
  return raw;
}

// src/startup-state.ts
var import_node_crypto = require("node:crypto");
var import_node_fs5 = require("node:fs");
function beginStartup(stateFile, launchId = (0, import_node_crypto.randomUUID)(), at = Date.now()) {
  const state2 = readStartupState(stateFile);
  const recovered = state2.pending !== void 0 && state2.pending.launchId !== launchId;
  writeStartupState(stateFile, { lastGood: state2.lastGood, pending: { launchId, at } });
  if (recovered) return { recovered, previousAttempt: state2.pending };
  return { recovered };
}
function commitStartup(stateFile) {
  const state2 = readStartupState(stateFile);
  if (state2.pending === void 0) return;
  writeStartupState(stateFile, { lastGood: state2.pending });
}
function readStartupState(stateFile) {
  if (!(0, import_node_fs5.existsSync)(stateFile)) return {};
  try {
    const parsed = JSON.parse((0, import_node_fs5.readFileSync)(stateFile, "utf8"));
    return {
      ...isStartupRecord(parsed.lastGood) ? { lastGood: parsed.lastGood } : {},
      ...isStartupRecord(parsed.pending) ? { pending: parsed.pending } : {}
    };
  } catch {
    return {};
  }
}
function writeStartupState(stateFile, state2) {
  const tmpFile = `${stateFile}.tmp`;
  (0, import_node_fs5.writeFileSync)(tmpFile, `${JSON.stringify(state2, null, 2)}
`);
  (0, import_node_fs5.renameSync)(tmpFile, stateFile);
}
function isStartupRecord(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.launchId === "string" && typeof record.at === "number";
}

// src/tray.ts
var import_electron2 = require("electron");
var TEMPLATE_TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAACWUlEQVRYhe2WTYiOURTHf2aYD2SkqclqfCxI+YoaseC1GGJnDAslUxZY2JBioaRZsDArkZ1pWOhNpiZEahYijK9iZjOrSTGmhhjSGEa3/q+O233mPo/Xu/L+69TznHu+7rn3nHugjDJKg3lA7l8anAvU6nsOsA/oBgaBx8AsT/4I0F+Mw2XABRn5AUyKRoBv5t9RU0D/utYuAw0JPppCWaoCOoCfnpOpaG3A+C2z/hFYJ/4CYAtwAvgCnLZKlUBPBscFGga2egGc92QeAFcDuq1W6cxfOC/Qd6DN2NqUQucDMLOgsAQYLyKASR3bYRPElYj8Xrv7ziKd2yAOmPvUFZBxd2KPdT4dGNXiENAHvCsyiFOyu9PwnwAtwGz/xq6WQK/HXwgcAl5FHE4AD1Wilv9amyn8u4sZxDYJ3E8SAHYDbxMC6FeZuQZ1Y4pAjycZ3yUBl/ZYe+0NGP6sO7QDqAFeJATgl+pv5IzQ4kgQ1Qm7/ATsl8yaQCMbV4aCWGQEjxKH6/vPAkE8BeYrU2+8tXsxo0PmPCtSBNGocgpVwESA/0fZhXDJCLs7kQZtKcvSvZgzYsaWm3Nz6atLGUR3ip7gHp9UyBvFm2okfpAngXrDqw+ct6VzZECD1wHzZghxWCX+e2C74W/Q0+o7vxPYRBQ54Ksx8hxYadYfmdR2qCxRmv1BxfWMZmBa1iA2A2PeObqx67aeXevkpTppjfSGA5kYUGlmwlKvj6chN7qdVS/JK1t3gXYNO5lRBRxUGcWcu3dkIyVCJbAeOKYh85roogaQFaVyXMb/gV/dRWbOp9K5uAAAAABJRU5ErkJggg==";
var BLUE_TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAADSUlEQVRYhe1WXYhMcRS/rG9Cm9q21Fpz/jOasogiHlgPiDcMD2Tdc8aE4oUUDzbJAw88ibwRHiRRQqQ8iKzv8lHaUqKde860Nl/Jx16dOx935s7dmdlln+ypf839z/+c8/ufc37n/C1rSIZkECROPfURlNZ/ZrCp7ePkqYl3Y/U3bMhMNOhsNsRXDEonIHe0bOwaX3zekOwC5FcDdgh2Jm6IT6gRg/zbkLi6AEUMyvf8t7fszPwyfeJL3nni082UbgjzoXplUYon3FGG5Jgh7i1xUmHFUOaVGUe5XjiD3APJzALdj7V1TYskneUGeZ9B+QokB32thFsHJFdrdew7ECdCzorSFPDx0nN8D1DOB3WBOFGEmg/323khNfwTyLHztiIkS6rr8cfG1IdxnkIMJQbIPwYKIGew1xDvLLrQuYrn7cym4pCd+TvnPghA2erXE58tTxn3AMqGgvPF7e4Ig9ydM/DOoDwyKOm/igTKAbULSWdtUb4fAjpr4tudCaWUQZ6TO3SneD+a7GoGlO0G+UUVh78M8n2PoqX7L73L+N/Hw+hoGeKV2UKSu6EHFAzxekPS1UcBvlKaZRsUX+4baGZvqPGIzetydEr3BcDLKfXUa5TKAcjnbA1lVje1vR0DJM/CAASp6gNAaS0YSzmRSiBgx5vRYbcE4k9R4qRnLylzg41MGaYRCk+BnZ7uV6jstqqI9n1D8iTklo9npLhRIwXE7wMAblc0arT6c/m02t3h1UBMw+4mpVMfveBXSJp82oUJkJwq5MrmddUAZHUcuyZaonTOTbkjKxqLbU7PzOdNwzc91T2pFhDeSK7SE3T41GLLMiQX/aKSa9pIgiCBeH809WFKfk9/B/MduP1Rq1ZppnRDoANezD9CPIBJZ3Zunw3yqgIIchbpaA1puTeDl6gqkSwlvxUVz1NjO7Py/wPyA7/Y5JjS0tPzZnzgoUJyBzCzzLLcYf0CEU3KUiD5UjpguMOg3NCxG6ju59pJtQGpnr4NQjrla6Vm/0CkZEZpH6+l2vk3EB/RXqLp02gB8S0gOaSPHau/Ek+4o4Bkm9KomnOdI2DzYmtQJOHWRbY4C4Fkjz4yDckFXYB8Uh8gUUq3DI7jIflf5A8E1QULjH3uGwAAAABJRU5ErkJggg==";
var electronTrayNative = {
  nativeImage: { createFromDataURL: (dataUrl) => import_electron2.nativeImage.createFromDataURL(dataUrl) },
  menu: {
    buildFromTemplate: (template) => import_electron2.Menu.buildFromTemplate(template)
  },
  createTray: (image) => new import_electron2.Tray(image)
};
function createDesktopTray(native, platform, show, exportDiagnostics, checkForUpdates, requestQuit) {
  const macOS = platform === "darwin";
  const source = macOS ? TEMPLATE_TRAY_ICON : BLUE_TRAY_ICON;
  const size = macOS ? 18 : 20;
  const image = native.nativeImage.createFromDataURL(source).resize({ width: size, height: size });
  if (macOS) image.setTemplateImage(true);
  if (image.isEmpty()) throw new Error("desktop tray icon is empty");
  const template = [
    { label: "Show DeepSeek Harness", click: show },
    { type: "separator" },
    { label: "Export diagnostics\u2026", click: exportDiagnostics },
    { label: "Check for updates\u2026", click: checkForUpdates },
    { type: "separator" },
    { label: "Quit", click: () => {
      requestQuit(0);
    } }
  ];
  const tray = native.createTray(image);
  tray.setToolTip("DeepSeek Harness");
  tray.setContextMenu(native.menu.buildFromTemplate(template));
  tray.on("double-click", show);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      tray.off("double-click", show);
      tray.destroy();
    }
  };
}

// src/updates.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs6 = require("node:fs");
var import_node_path5 = require("node:path");
var import_semver = __toESM(require_semver2());
var UPDATE_RELEASE_REPOSITORY = "Gakiwoo/deepseek-harness-application";
var UPDATE_CHECKSUM_SUFFIX = ".sha256";
var UPDATE_APPLY_TIMEOUT_MS = 12e4;
var DesktopUpdateError = class extends Error {
  /** Stable machine-readable failure code. */
  code;
  /** Creates the typed failure. */
  constructor(code, message) {
    super(message);
    this.name = "DesktopUpdateError";
    this.code = code;
  }
};
var CHECKSUM_PATTERN = /^([0-9a-f]{64})/m;
var RELEASES_PER_PAGE = 5;
function parseChecksum(content) {
  const match = content.match(CHECKSUM_PATTERN);
  if (match === null) {
    throw new DesktopUpdateError("checksum", "checksum asset does not contain a sha256 digest");
  }
  return match[1];
}
function versionFromTag(tagName) {
  const version = (0, import_semver.valid)(tagName.replace(/^v/, ""));
  return version ?? void 0;
}
function matchArtifact(release, platform, arch) {
  const candidates = release.assets.filter((asset) => {
    if (platform === "darwin") {
      return /^DeepSeek-Harness-.*-mac-(arm64|x64)\.(zip|dmg)$/.test(asset.name) && asset.name.includes(`-mac-${arch}`);
    }
    if (platform === "win32") {
      return /^DeepSeek-Harness-.*-win-x64\.exe$/.test(asset.name);
    }
    return false;
  });
  if (candidates.length === 0) return void 0;
  const preferred = candidates.find((asset) => asset.name.endsWith(platform === "win32" ? ".exe" : ".zip"));
  const artifact = preferred ?? candidates[0];
  const checksum = release.assets.find((asset) => asset.name === `${artifact.name}${UPDATE_CHECKSUM_SUFFIX}`);
  if (checksum === void 0) {
    throw new DesktopUpdateError(
      "checksum",
      `release ${release.tagName} carries ${artifact.name} without its ${UPDATE_CHECKSUM_SUFFIX} sidecar`
    );
  }
  const kind = artifact.name.endsWith(".dmg") ? "dmg" : artifact.name.endsWith(".exe") ? "exe" : "zip";
  return {
    name: artifact.name,
    url: artifact.url,
    size: artifact.size,
    kind,
    checksumUrl: checksum.url
  };
}
async function fetchReleases(native, repository) {
  const endpoint = `https://api.github.com/repos/${repository}/releases?per_page=${RELEASES_PER_PAGE}`;
  const response = await native.fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DeepSeek-Harness-Desktop"
    }
  });
  if (!response.ok) {
    throw new DesktopUpdateError("feed", `release feed responded ${response.status} for ${repository}`);
  }
  const releases = await response.json();
  return releases.map((release) => ({
    tagName: release.tag_name,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size
    }))
  }));
}
function selectUpdate(releases, platform, arch, currentVersion) {
  if (platform !== "darwin" && platform !== "win32") {
    throw new DesktopUpdateError("artifact", `desktop updates are not offered on ${platform}`);
  }
  const currentIsPrerelease = currentVersion.includes("-");
  const eligible = releases.filter((release) => {
    const version2 = versionFromTag(release.tagName);
    if (version2 === void 0) return false;
    if (version2 === currentVersion) return false;
    if (!currentIsPrerelease && release.prerelease) return false;
    return (0, import_semver.compare)(version2, currentVersion) > 0;
  });
  if (eligible.length === 0) return void 0;
  const newest = eligible.reduce((best, release) => {
    const bestVersion = versionFromTag(best.tagName);
    const version2 = versionFromTag(release.tagName);
    return (0, import_semver.compare)(version2, bestVersion) > 0 ? release : best;
  });
  const version = versionFromTag(newest.tagName);
  const artifact = matchArtifact(newest, platform, arch);
  if (artifact === void 0) {
    throw new DesktopUpdateError(
      "artifact",
      `release ${newest.tagName} ships no ${platform} artifact for this build`
    );
  }
  return {
    version,
    releaseName: newest.tagName,
    publishedAt: newest.publishedAt,
    artifact
  };
}
async function downloadUpdate(native, info, directory, onProgress) {
  (0, import_node_fs6.mkdirSync)(directory, { recursive: true });
  const targetPath = (0, import_node_path5.join)(directory, info.artifact.name);
  const partPath = (0, import_node_path5.join)(directory, `${info.artifact.name}.part`);
  const checksumResponse = await native.fetch(info.artifact.checksumUrl, {
    headers: { "User-Agent": "DeepSeek-Harness-Desktop" }
  });
  if (!checksumResponse.ok) {
    throw new DesktopUpdateError("checksum", `checksum sidecar responded ${checksumResponse.status}`);
  }
  const expected = parseChecksum(await checksumResponse.text());
  const response = await native.fetch(info.artifact.url, {
    headers: { "User-Agent": "DeepSeek-Harness-Desktop" }
  });
  if (!response.ok) {
    throw new DesktopUpdateError("download", `artifact download responded ${response.status}`);
  }
  if (response.body === null) {
    throw new DesktopUpdateError("download", `artifact download for ${info.artifact.name} has no body`);
  }
  const hash = (0, import_node_crypto2.createHash)("sha256");
  const total = info.artifact.size;
  let received = 0;
  const writeStream = (0, import_node_fs6.createWriteStream)(partPath);
  try {
    for await (const chunk of response.body) {
      const bytes = chunk;
      hash.update(bytes);
      received += bytes.byteLength;
      writeStream.write(bytes);
      onProgress?.({ received, total });
    }
    await new Promise((resolve2, reject) => {
      writeStream.end(() => {
        resolve2();
      });
      writeStream.on("error", reject);
    });
  } catch (error) {
    (0, import_node_fs6.rmSync)(partPath, { force: true });
    if (error instanceof DesktopUpdateError) throw error;
    throw new DesktopUpdateError("download", `artifact download for ${info.artifact.name} failed: ${String(error)}`);
  }
  const digest = hash.digest("hex");
  if (digest !== expected) {
    (0, import_node_fs6.rmSync)(partPath, { force: true });
    throw new DesktopUpdateError(
      "checksum",
      `artifact ${info.artifact.name} sha256 ${digest} does not match the release ${expected}`
    );
  }
  (0, import_node_fs6.renameSync)(partPath, targetPath);
  return targetPath;
}
function planApply(info, platform) {
  if (platform === "darwin") {
    return info.artifact.kind === "zip" ? "swap" : "unsupported";
  }
  if (platform === "win32" && info.artifact.kind === "exe") {
    return "silent-install";
  }
  return "unsupported";
}
function createDesktopUpdater(native, options) {
  const updatesDir = (0, import_node_path5.join)(options.userDataDir, "updates");
  const markerPath = (0, import_node_path5.join)(updatesDir, "pending.json");
  const repository = native.env.DSH_DESKTOP_UPDATE_REPOSITORY ?? UPDATE_RELEASE_REPOSITORY;
  function readMarker() {
    if (!(0, import_node_fs6.existsSync)(markerPath)) return void 0;
    try {
      const marker = JSON.parse((0, import_node_fs6.readFileSync)(markerPath, "utf8"));
      return {
        version: marker.version,
        releaseName: marker.releaseName,
        publishedAt: marker.publishedAt,
        artifact: marker.artifact
      };
    } catch {
      return void 0;
    }
  }
  return {
    async check() {
      if (!options.enabled) {
        throw new DesktopUpdateError("feed", "desktop updates are disabled on this install");
      }
      const releases = await fetchReleases(native, repository);
      return selectUpdate(releases, options.platform, options.arch, options.currentVersion);
    },
    async download(info, onProgress) {
      return downloadUpdate(native, info, updatesDir, onProgress);
    },
    async stage(info, artifactPath) {
      (0, import_node_fs6.mkdirSync)(updatesDir, { recursive: true });
      const action = planApply(info, options.platform);
      if (action === "unsupported") {
        throw new DesktopUpdateError("apply", `no clean-exit apply exists for ${info.artifact.kind} on ${options.platform}`);
      }
      let stagedAppPath;
      if (action === "swap") {
        const extractDir = (0, import_node_path5.join)(updatesDir, `extracted-${info.version}`);
        (0, import_node_fs6.rmSync)(extractDir, { recursive: true, force: true });
        (0, import_node_fs6.mkdirSync)(extractDir, { recursive: true });
        const exitCode = await new Promise((resolve2) => {
          const child = native.spawn("ditto", ["-x", "-k", artifactPath, extractDir]);
          child.on("exit", (code) => {
            resolve2(code);
          });
        });
        if (exitCode !== 0) {
          throw new DesktopUpdateError("stage", `bundle extraction failed with exit ${exitCode}`);
        }
        const appName = readdirApps(extractDir);
        if (appName === void 0) {
          throw new DesktopUpdateError("stage", `extraction of ${info.artifact.name} produced no .app bundle`);
        }
        const stagedBundlePath = (0, import_node_path5.join)(extractDir, appName);
        const bundleVersion = native.plistBundleVersion(stagedBundlePath);
        if (bundleVersion !== info.version) {
          throw new DesktopUpdateError(
            "stage",
            `staged bundle version ${bundleVersion} does not match release ${info.version}`
          );
        }
        const quarantineExit = await new Promise((resolve2) => {
          const child = native.spawn("xattr", ["-dr", "com.apple.quarantine", stagedBundlePath]);
          child.on("exit", (code) => {
            resolve2(code);
          });
        });
        if (quarantineExit !== 0) {
          throw new DesktopUpdateError("stage", `quarantine removal failed with exit ${quarantineExit}`);
        }
        stagedAppPath = stagedBundlePath;
      }
      (0, import_node_fs6.writeFileSync)(markerPath, JSON.stringify({
        version: info.version,
        releaseName: info.releaseName,
        publishedAt: info.publishedAt,
        artifact: info.artifact,
        action,
        stagedAppPath
      }, null, 2));
    },
    pendingUpdate: readMarker,
    async applyPending() {
      const marker = readMarker();
      if (marker === void 0) return;
      if (!options.enabled) {
        throw new DesktopUpdateError("apply", "desktop updates are disabled on this install");
      }
      const action = planApply(marker, options.platform);
      if (action === "silent-install") {
        native.spawn((0, import_node_path5.join)(updatesDir, marker.artifact.name), ["/S"], {
          detached: true,
          stdio: "ignore"
        }).unref();
        (0, import_node_fs6.rmSync)(markerPath, { force: true });
        return;
      }
      if (action === "swap") {
        await applySwap(marker, updatesDir, markerPath, options.currentAppPath, native);
        return;
      }
      throw new DesktopUpdateError("apply", `no clean-exit apply exists for ${marker.artifact.kind} on ${options.platform}`);
    },
    cancelPending() {
      const marker = readMarker();
      if (marker !== void 0 && marker.artifact.kind === "zip") {
        (0, import_node_fs6.rmSync)((0, import_node_path5.join)(updatesDir, `extracted-${marker.version}`), { recursive: true, force: true });
      }
      (0, import_node_fs6.rmSync)(markerPath, { force: true });
    }
  };
}
function readdirApps(directory) {
  return (0, import_node_fs6.readdirSync)(directory).find((entry) => entry.endsWith(".app"));
}
async function applySwap(marker, updatesDir, markerPath, currentAppPath, native) {
  if (marker.artifact.kind !== "zip") {
    throw new DesktopUpdateError("apply", `swap requires a zip artifact, got ${marker.artifact.kind}`);
  }
  const stagedAppPath = markerStagedAppPath(marker, updatesDir);
  const destDir = (0, import_node_path5.dirname)(currentAppPath);
  const destName = (0, import_node_path5.basename)(currentAppPath);
  const stagedCopy = (0, import_node_path5.join)(destDir, `.harness-staged-${marker.version}`);
  const oldPath = (0, import_node_path5.join)(destDir, `${destName}.old`);
  await copyTree(native, stagedAppPath, stagedCopy);
  try {
    (0, import_node_fs6.rmSync)(oldPath, { recursive: true, force: true });
    (0, import_node_fs6.renameSync)(currentAppPath, oldPath);
    (0, import_node_fs6.renameSync)(stagedCopy, currentAppPath);
  } catch (error) {
    try {
      (0, import_node_fs6.renameSync)(oldPath, currentAppPath);
    } catch {
    }
    try {
      (0, import_node_fs6.rmSync)(stagedCopy, { recursive: true, force: true });
    } catch {
    }
    throw new DesktopUpdateError("apply", `bundle swap failed: ${String(error)}`);
  }
  (0, import_node_fs6.rmSync)(oldPath, { recursive: true, force: true });
  (0, import_node_fs6.rmSync)((0, import_node_path5.join)(updatesDir, `extracted-${marker.version}`), { recursive: true, force: true });
  (0, import_node_fs6.rmSync)(markerPath, { force: true });
}
function markerStagedAppPath(marker, updatesDir) {
  if (marker.artifact.kind !== "zip") {
    throw new DesktopUpdateError("apply", `swap requires a zip artifact, got ${marker.artifact.kind}`);
  }
  const extractDir = (0, import_node_path5.join)(updatesDir, `extracted-${marker.version}`);
  const appName = readdirApps(extractDir);
  if (appName === void 0) {
    throw new DesktopUpdateError("apply", `staged extraction ${extractDir} has no .app bundle`);
  }
  return (0, import_node_path5.join)(extractDir, appName);
}
async function copyTree(native, source, destination) {
  const exitCode = await new Promise((resolve2) => {
    const child = native.spawn("ditto", [source, destination]);
    child.on("exit", (code) => {
      resolve2(code);
    });
  });
  if (exitCode !== 0) {
    throw new DesktopUpdateError("apply", `bundle copy failed with exit ${exitCode}`);
  }
}

// src/window.ts
var import_electron3 = require("electron");
var import_node_path6 = require("node:path");
var EXTERNAL_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:", "mailto:"]);
function showDesktopWindow(window) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function handleDesktopWindowClose(window, event, quitting) {
  if (quitting) return;
  event.preventDefault();
  if (!window.isDestroyed()) window.hide();
}
function isDesktopNavigation(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "dsh:" && url.hostname === "app";
  } catch {
    return false;
  }
}
function handleDesktopWindowOpen(raw, openExternal, report) {
  try {
    if (!EXTERNAL_PROTOCOLS.has(new URL(raw).protocol)) return { action: "deny" };
    void openExternal(raw).catch(report);
  } catch (error) {
    if (error instanceof TypeError) return { action: "deny" };
    report(error);
  }
  return { action: "deny" };
}
function createMainWindow(resourcesDir, isQuitting, reportExternalOpenError2) {
  const window = new import_electron3.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#1e1e1e",
    title: "DeepSeek Harness",
    webPreferences: {
      preload: (0, import_node_path6.join)(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const onReady = () => {
    showDesktopWindow(window);
  };
  const onClose = (event) => {
    handleDesktopWindowClose(window, event, isQuitting());
  };
  const onFrameNavigate = (event) => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault();
  };
  const onRedirect = (event) => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault();
  };
  void window.loadFile((0, import_node_path6.join)(resourcesDir, "splash.html"));
  window.once("ready-to-show", onReady);
  window.on("close", onClose);
  window.webContents.on("will-frame-navigate", onFrameNavigate);
  window.webContents.on("will-redirect", onRedirect);
  window.webContents.setWindowOpenHandler(({ url }) => handleDesktopWindowOpen(
    url,
    (externalUrl) => import_electron3.shell.openExternal(externalUrl),
    reportExternalOpenError2
  ));
  let disposed = false;
  return {
    window,
    show: () => {
      showDesktopWindow(window);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.off("ready-to-show", onReady);
      window.off("close", onClose);
      window.webContents.off("will-frame-navigate", onFrameNavigate);
      window.webContents.off("will-redirect", onRedirect);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      if (!window.isDestroyed()) window.destroy();
    }
  };
}

// ../../packages/client/connection/lib/desktop-bridge.js
var DSH_FETCH_REQUEST = "dsh-fetch/request";
var DSH_FETCH_RESPONSE = "dsh-fetch/response";
var DSH_FETCH_CHUNK = "dsh-fetch/chunk";
var DSH_FETCH_END = "dsh-fetch/end";
var DSH_FETCH_ERROR = "dsh-fetch/error";
var DSH_FETCH_ABORT = "dsh-fetch/abort";

// src/host-glue/fetch-pump.ts
function parseWireRequest(raw) {
  if (typeof raw !== "object" || raw === null) return void 0;
  const candidate = raw;
  if (typeof candidate.id !== "string" || typeof candidate.url !== "string" || typeof candidate.method !== "string" || typeof candidate.headers !== "object" || candidate.headers === null || candidate.body !== null && typeof candidate.body !== "string") return void 0;
  return raw;
}
function mountFetchPump(ipc, sender, fetch2) {
  const aborts = /* @__PURE__ */ new Map();
  ipc.handle(DSH_FETCH_REQUEST, (raw) => {
    const wire = parseWireRequest(raw);
    if (wire === void 0) return { accepted: false };
    const controller = new AbortController();
    aborts.set(wire.id, controller);
    void pumpOne(sender, wire, controller.signal, fetch2).finally(() => {
      aborts.delete(wire.id);
    });
    return { accepted: true };
  });
  ipc.handle(DSH_FETCH_ABORT, (raw) => {
    const id = raw?.id;
    if (typeof id === "string") aborts.get(id)?.abort();
    return { accepted: true };
  });
  return {
    dispose() {
      for (const controller of aborts.values()) controller.abort();
      aborts.clear();
      ipc.removeHandler(DSH_FETCH_REQUEST);
      ipc.removeHandler(DSH_FETCH_ABORT);
    }
  };
}
async function pumpOne(sender, wire, signal, fetch2) {
  try {
    const parsed = new URL(wire.url);
    const request = new Request(`${parsed.protocol === "dsh:" ? "http" : parsed.protocol.slice(0, -1)}://127.0.0.1${parsed.pathname}${parsed.search}`, {
      method: wire.method,
      headers: wire.headers,
      ...wire.body === null ? {} : { body: wire.body },
      signal
    });
    const response = await fetch2(request);
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    sender.send(DSH_FETCH_RESPONSE, { id: wire.id, status: response.status, headers });
    if (response.body === null) {
      sender.send(DSH_FETCH_END, { id: wire.id });
      return;
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > 0) sender.send(DSH_FETCH_CHUNK, { id: wire.id, data: value });
    }
    sender.send(DSH_FETCH_END, { id: wire.id });
  } catch (error) {
    sender.send(DSH_FETCH_ERROR, { id: wire.id, message: error instanceof Error ? error.message : String(error) });
  }
}

// src/main.ts
var state = {};
function ipcFace() {
  return {
    handle: (channel, listener) => {
      import_electron4.ipcMain.handle(channel, (_event, raw) => listener(raw));
    },
    removeHandler: (channel) => {
      import_electron4.ipcMain.removeHandler(channel);
    }
  };
}
if (!import_electron4.app.requestSingleInstanceLock()) {
  import_electron4.app.exit(0);
} else {
  let disposeNativeListeners = () => {
  };
  const shutdown = createDesktopShutdown(
    () => disposeDesktopShell({
      pump: state.pump,
      host: state.host,
      native: {
        dispose: () => {
          disposeNativeListeners();
          state.tray?.dispose();
          state.window?.dispose();
        }
      },
      updater: state.updater ? { applyPending: () => {
        return state.updater?.applyPending() ?? Promise.resolve();
      } } : void 0
    }),
    (code) => {
      import_electron4.app.exit(code);
    }
  );
  const onSecondInstance = () => {
    state.window?.show();
  };
  const onActivate = () => {
    state.window?.show();
  };
  const onUnhandledRejection = (reason) => {
    reportFailure("Unexpected failure", reason, shutdown);
  };
  const disposeShutdownRequests = installShutdownRequests(
    process,
    import_electron4.app,
    (code) => {
      void shutdown.request(code);
    }
  );
  import_electron4.app.on("second-instance", onSecondInstance);
  import_electron4.app.on("activate", onActivate);
  process.on("unhandledRejection", onUnhandledRejection);
  disposeNativeListeners = () => {
    disposeShutdownRequests();
    import_electron4.app.off("second-instance", onSecondInstance);
    import_electron4.app.off("activate", onActivate);
    process.off("unhandledRejection", onUnhandledRejection);
  };
  try {
    registerDshScheme();
    void import_electron4.app.whenReady().then(() => {
      return bootPrimaryInstance(shutdown);
    }).catch((error) => {
      reportFailure("Unexpected failure", error, shutdown);
    });
  } catch (error) {
    reportFailure("Startup failure", error, shutdown);
  }
}
async function bootPrimaryInstance(shutdown) {
  const stateFile = (0, import_node_path7.join)(import_electron4.app.getPath("userData"), "startup-state.json");
  const startup = beginStartup(stateFile, (0, import_node_crypto3.randomUUID)());
  await recoverShellEnvironment({
    enabled: import_electron4.app.isPackaged || process.env.DSH_DESKTOP_SHELL_ENV === "1"
  });
  const resourcesDir = import_electron4.app.isPackaged ? process.resourcesPath : (0, import_node_path7.join)(import_electron4.app.getAppPath(), "resources");
  const window = createMainWindow(
    resourcesDir,
    () => shutdown.isPending(),
    reportExternalOpenError
  );
  state.window = window;
  window.window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    recordCrashEvidence(`renderer ${details.reason}`, `exitCode: ${details.exitCode}`);
  });
  state.tray = createDesktopTray(
    electronTrayNative,
    process.platform,
    () => {
      state.window?.show();
    },
    runDiagnosticsExport,
    () => {
      void runUpdateCheck(shutdown);
    },
    (code) => {
      void shutdown.request(code);
    }
  );
  state.updater = createDesktopUpdater(updateNative(), {
    enabled: import_electron4.app.isPackaged || process.env.DSH_DESKTOP_UPDATE_CHECK === "1",
    platform: process.platform,
    arch: process.arch,
    currentVersion: import_electron4.app.getVersion(),
    currentAppPath: (0, import_node_path7.join)(import_electron4.app.getPath("exe"), "..", "..", ".."),
    userDataDir: import_electron4.app.getPath("userData")
  });
  const hostBootPath = import_electron4.app.isPackaged ? (0, import_node_path7.join)(process.resourcesPath, "host", "lib", "host-boot.js") : (0, import_node_path7.join)(import_electron4.app.getAppPath(), "node_modules", "@deepseek-ai", "dsh-desktop-app", "lib", "host-boot.js");
  const { bootDesktopHost } = await import((0, import_node_url.pathToFileURL)(hostBootPath).href);
  let host;
  try {
    host = await bootDesktopHost({
      frontendIndexPath: (0, import_node_path7.join)(resourcesDir, "frontend", "index.html"),
      requestExit: (code) => {
        void shutdown.request(code);
      }
    });
  } catch (error) {
    reportFailure("Startup failure", error, shutdown);
    return;
  }
  state.host = host;
  mountDshProtocol(host.runtime);
  state.pump = mountFetchPump(
    ipcFace(),
    window.window.webContents,
    (request) => host.runtime.fetch(request)
  );
  await window.window.loadURL("dsh://app/");
  commitStartup(stateFile);
  if (startup.recovered) {
    process.stderr.write(`[desktop] previous launch ${startup.previousAttempt?.launchId ?? "unknown"} did not complete
`);
    if (import_electron4.app.isPackaged) {
      void import_electron4.dialog.showMessageBox(window.window, {
        type: "warning",
        title: "DeepSeek Harness",
        message: "The previous launch did not complete.",
        detail: "The previous launch exited before the window was ready, usually because it crashed or was force-quit. If this keeps happening, report it with the log files from the Harness home directory.",
        buttons: ["OK"]
      }).catch(() => {
      });
    }
  }
}
function reportFailure(title, error, shutdown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  recordCrashEvidence(title, message);
  import_electron4.dialog.showErrorBox("DeepSeek Harness", `${title}:
${message}`);
  process.stderr.write(`[desktop] ${title}: ${message}
`);
  void shutdown.request(1);
}
function recordCrashEvidence(reason, detail) {
  try {
    writeCrashEvidence(crashEvidenceDir(), buildCrashEvidence({
      reason,
      detail,
      ...environmentFactsOptions()
    }));
  } catch (error) {
    process.stderr.write(`[desktop] crash evidence failed: ${String(error)}
`);
  }
}
function environmentFactsOptions() {
  return {
    appVersion: import_electron4.app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: import_electron4.app.isPackaged,
    env: process.env
  };
}
function runDiagnosticsExport() {
  void (async () => {
    const home = resolveDshHome();
    const path = await exportDiagnosticsArchive(
      home,
      collectDiagnosticsFacts(environmentFactsOptions(), (0, import_node_path7.join)(home, "sessions"))
    );
    void import_electron4.dialog.showMessageBox({
      type: "info",
      title: "DeepSeek Harness",
      message: "Diagnostics exported.",
      detail: `Attach this file to your report:
${path}`,
      buttons: ["OK"]
    });
  })().catch((error) => {
    import_electron4.dialog.showErrorBox("DeepSeek Harness", `Unable to export diagnostics:
${String(error)}`);
  });
}
function reportExternalOpenError(error) {
  import_electron4.dialog.showErrorBox("DeepSeek Harness", `Unable to open external link:
${String(error)}`);
}
function updateNative() {
  return {
    fetch: (input, init) => {
      return fetch(input, init);
    },
    spawn: (command, args, options) => {
      return (0, import_node_child_process3.spawn)(command, args, options ?? {});
    },
    env: process.env,
    plistBundleVersion: (appPath) => {
      return (0, import_node_child_process3.execFileSync)(
        "plutil",
        ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", (0, import_node_path7.join)(appPath, "Contents", "Info.plist")],
        { encoding: "utf8" }
      ).trim();
    }
  };
}
function runUpdateCheck(shutdown) {
  return (async () => {
    const updater = state.updater;
    if (updater === void 0) return;
    const info = await updater.check();
    if (info === void 0) {
      void import_electron4.dialog.showMessageBox({
        type: "info",
        title: "DeepSeek Harness",
        message: "DeepSeek Harness is up to date.",
        detail: `You are running the newest release (${import_electron4.app.getVersion()}).`,
        buttons: ["OK"]
      });
      return;
    }
    const downloadChoice = await import_electron4.dialog.showMessageBox({
      type: "info",
      title: "DeepSeek Harness",
      message: `DeepSeek Harness ${info.version} is available.`,
      detail: `You are running ${import_electron4.app.getVersion()}. The update downloads in the background and installs when you quit.`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1
    });
    if (downloadChoice.response !== 0) return;
    const artifactPath = await updater.download(info, (progress) => {
      notifyProgress(info.version, progress.received / progress.total);
    });
    await updater.stage(info, artifactPath);
    const installChoice = await import_electron4.dialog.showMessageBox({
      type: "info",
      title: "DeepSeek Harness",
      message: `Update ${info.version} is ready.`,
      detail: "Install it now and quit, or it installs next time you quit the app.",
      buttons: ["Install now and quit", "Later"],
      defaultId: 0,
      cancelId: 1
    });
    if (installChoice.response === 0) {
      void shutdown.request(0, UPDATE_APPLY_TIMEOUT_MS);
    }
  })().catch((error) => {
    import_electron4.dialog.showErrorBox("DeepSeek Harness", `Unable to check for updates:
${String(error)}`);
  });
}
function notifyProgress(version, ratio) {
  const step = Math.floor(ratio * 4);
  if (step < 1 || step > 4) return;
  const body = ["downloaded 25%.", "downloaded 50%.", "downloaded 75%.", "is ready to install."][step - 1];
  new import_electron4.Notification({
    title: `DeepSeek Harness ${version}`,
    body
  }).show();
}
//# sourceMappingURL=main.js.map
