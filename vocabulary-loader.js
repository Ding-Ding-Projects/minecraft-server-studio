/*
 * Browser-local validation for the neutral personal-vocabulary payload.
 * This module deliberately has no DOM, network, storage, or logging access.
 */

export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1;
export const PERSONAL_VOCABULARY_CACHE_SCHEMA_VERSION = 1;

export const PERSONAL_VOCABULARY_LIMITS = Object.freeze({
  maxPayloadBytes: 64 * 1024,
  maxNestingDepth: 3,
  maxEntries: 250,
  maxFromCodePoints: 128,
  maxToCodePoints: 512
});

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const OWN = Object.prototype.hasOwnProperty;

function failure(code) {
  return Object.freeze({ ok: false, code });
}

function success(value) {
  return Object.freeze({ ok: true, value });
}

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => OWN.call(value, key));
}

function codePointCount(value) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return -1;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return -1;
    }
    count += 1;
  }
  return count;
}

function utf8ByteLength(value) {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) {
      length += 1;
    } else if (unit <= 0x7ff) {
      length += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return -1;
      length += 4;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return -1;
    } else {
      length += 3;
    }
  }
  return length;
}

function bytesFromInput(input) {
  if (typeof ArrayBuffer === "undefined") return null;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

function decodeBoundedInput(input) {
  if (typeof input === "string") {
    const length = utf8ByteLength(input);
    if (length < 0) return failure("invalid-unicode");
    if (length > PERSONAL_VOCABULARY_LIMITS.maxPayloadBytes) return failure("payload-too-large");
    return success(input);
  }

  const bytes = bytesFromInput(input);
  if (!bytes) return failure("unsupported-input-type");
  if (bytes.byteLength > PERSONAL_VOCABULARY_LIMITS.maxPayloadBytes) return failure("payload-too-large");
  if (typeof TextDecoder !== "function") return failure("utf8-decoder-unavailable");

  try {
    return success(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (_) {
    return failure("invalid-utf8");
  }
}

class StrictJsonParser {
  constructor(source, maxDepth) {
    this.source = source;
    this.maxDepth = maxDepth;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) this.fail("trailing-data");
    return value;
  }

  fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  skipWhitespace() {
    while (this.index < this.source.length) {
      const unit = this.source.charCodeAt(this.index);
      if (unit !== 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d) return;
      this.index += 1;
    }
  }

  parseValue(depth) {
    this.skipWhitespace();
    if (depth > this.maxDepth) this.fail("nesting-limit");
    const character = this.source[this.index];
    if (character === "{") return this.parseObject(depth);
    if (character === "[") return this.parseArray(depth);
    if (character === "\"") return this.parseString();
    if (character === "t") return this.parseKeyword("true", true);
    if (character === "f") return this.parseKeyword("false", false);
    if (character === "n") return this.parseKeyword("null", null);
    if (character === "-" || (character >= "0" && character <= "9")) return this.parseNumber();
    this.fail("malformed-json");
  }

  parseObject(depth) {
    this.index += 1;
    this.skipWhitespace();
    const record = Object.create(null);
    const seen = new Set();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return record;
    }

    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== "\"") this.fail("object-key-required");
      const key = this.parseString();
      if (UNSAFE_OBJECT_KEYS.has(key)) this.fail("unsafe-object-key");
      if (seen.has(key)) this.fail("duplicate-object-key");
      seen.add(key);

      this.skipWhitespace();
      if (this.source[this.index] !== ":") this.fail("object-colon-required");
      this.index += 1;
      record[key] = this.parseValue(depth + 1);

      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "}") {
        this.index += 1;
        return record;
      }
      if (separator !== ",") this.fail("object-separator-required");
      this.index += 1;
    }
  }

  parseArray(depth) {
    this.index += 1;
    this.skipWhitespace();
    const values = [];
    if (this.source[this.index] === "]") {
      this.index += 1;
      return values;
    }

    while (true) {
      values.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "]") {
        this.index += 1;
        return values;
      }
      if (separator !== ",") this.fail("array-separator-required");
      this.index += 1;
    }
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const unit = this.source.charCodeAt(this.index);
      const character = this.source[this.index];
      if (character === "\"") {
        this.index += 1;
        let value;
        try {
          value = JSON.parse(this.source.slice(start, this.index));
        } catch (_) {
          this.fail("invalid-string");
        }
        if (codePointCount(value) < 0) this.fail("invalid-unicode");
        return value;
      }
      if (unit <= 0x1f) this.fail("invalid-string");
      if (character === "\\") {
        this.index += 1;
        if (this.index >= this.source.length) this.fail("invalid-string");
        const escape = this.source[this.index];
        this.index += 1;
        if (escape === "u") {
          if (this.index + 4 > this.source.length) this.fail("invalid-string");
          for (let offset = 0; offset < 4; offset += 1) {
            if (!/[0-9a-fA-F]/.test(this.source[this.index + offset])) this.fail("invalid-string");
          }
          this.index += 4;
        } else if ("\"\\/bfnrt".indexOf(escape) === -1) {
          this.fail("invalid-string");
        }
      } else {
        this.index += 1;
      }
    }
    this.fail("unterminated-string");
  }

  parseKeyword(keyword, value) {
    if (this.source.slice(this.index, this.index + keyword.length) !== keyword) {
      this.fail("malformed-json");
    }
    this.index += keyword.length;
    return value;
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) this.fail("invalid-number");
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail("invalid-number");
    this.index += match[0].length;
    return value;
  }
}

function parseStrictJson(input) {
  const decoded = decodeBoundedInput(input);
  if (!decoded.ok) return decoded;
  try {
    return success(new StrictJsonParser(decoded.value, PERSONAL_VOCABULARY_LIMITS.maxNestingDepth).parse());
  } catch (error) {
    return failure(error && error.code ? error.code : "malformed-json");
  }
}

function freezePayload(version, replacements) {
  const stableReplacements = replacements.map((entry) => Object.freeze({
    from: entry.from,
    to: entry.to
  }));
  return Object.freeze({
    version,
    replacements: Object.freeze(stableReplacements)
  });
}

function validatePayloadRecord(value) {
  if (!hasExactKeys(value, ["version", "replacements"])) return failure("unexpected-payload-fields");
  if (value.version !== PERSONAL_VOCABULARY_SCHEMA_VERSION) return failure("unsupported-payload-version");
  if (!Array.isArray(value.replacements)) return failure("replacements-must-be-an-array");
  if (value.replacements.length > PERSONAL_VOCABULARY_LIMITS.maxEntries) return failure("too-many-replacements");

  const sourceValues = new Set();
  const replacements = [];
  for (const entry of value.replacements) {
    if (!hasExactKeys(entry, ["from", "to"])) return failure("unexpected-replacement-fields");
    if (typeof entry.from !== "string" || typeof entry.to !== "string") return failure("replacement-values-must-be-strings");

    const fromLength = codePointCount(entry.from);
    const toLength = codePointCount(entry.to);
    if (fromLength <= 0 || fromLength > PERSONAL_VOCABULARY_LIMITS.maxFromCodePoints) {
      return failure("replacement-source-out-of-bounds");
    }
    if (toLength < 0 || toLength > PERSONAL_VOCABULARY_LIMITS.maxToCodePoints) {
      return failure("replacement-target-out-of-bounds");
    }
    if (sourceValues.has(entry.from)) return failure("duplicate-replacement-source");
    sourceValues.add(entry.from);
    replacements.push({ from: entry.from, to: entry.to });
  }

  return success(freezePayload(PERSONAL_VOCABULARY_SCHEMA_VERSION, replacements));
}

function freezeCacheEnvelope(savedAt, payload) {
  return Object.freeze({
    cacheVersion: PERSONAL_VOCABULARY_CACHE_SCHEMA_VERSION,
    savedAt,
    payload
  });
}

function validTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateCacheRecord(value) {
  if (!hasExactKeys(value, ["cacheVersion", "savedAt", "payload"])) return failure("unexpected-cache-fields");
  if (value.cacheVersion !== PERSONAL_VOCABULARY_CACHE_SCHEMA_VERSION) return failure("unsupported-cache-version");

  if (value.savedAt === null && value.payload === null) {
    return success(freezeCacheEnvelope(null, null));
  }
  if (!validTimestamp(value.savedAt) || value.payload === null) return failure("incomplete-cache-envelope");

  const payload = validatePayloadRecord(value.payload);
  if (!payload.ok) return failure("invalid-cache-payload");
  return success(freezeCacheEnvelope(value.savedAt, payload.value));
}

/**
 * Validates a serialized payload before a caller persists or applies it.
 * Accepted input is a string, ArrayBuffer, or typed-array view only.
 */
export function validatePersonalVocabularyPayload(input) {
  const parsed = parseStrictJson(input);
  return parsed.ok ? validatePayloadRecord(parsed.value) : parsed;
}

/**
 * Validates a serialized browser-local cache envelope before a caller loads it.
 */
export function validatePersonalVocabularyCache(input) {
  const parsed = parseStrictJson(input);
  return parsed.ok ? validateCacheRecord(parsed.value) : parsed;
}

/**
 * Creates a validated cache envelope from an already validated payload value.
 */
export function createPersonalVocabularyCacheEnvelope(payload, savedAt = Date.now()) {
  if (!validTimestamp(savedAt)) return failure("invalid-cache-timestamp");
  const validatedPayload = validatePayloadRecord(payload);
  if (!validatedPayload.ok) return validatedPayload;
  return success(freezeCacheEnvelope(savedAt, validatedPayload.value));
}

/**
 * Produces the only cache envelope that represents an explicit local clear.
 */
export function createClearedPersonalVocabularyCacheEnvelope() {
  return freezeCacheEnvelope(null, null);
}
