(function registerRconResponseSafety(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StudioRconResponseSafety = api;
})(typeof globalThis === 'undefined' ? null : globalThis, () => {
  'use strict';

  const RESPONSE_VERSION = 1;
  const RESPONSE_KIND = 'rcon-response';
  const MAX_PRESENTATION_BYTES = 64 * 1024;
  const REDACTION_MARKER = '[redacted]';
  const TRUNCATION_MARKER = '[truncated]';
  const SANITIZATION_MARKER = '[sanitized]';
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

  const CREDENTIAL_KEY = String.raw`(?:password|passwd|token|secret|credential|authorization|auth|api[-_]?key|access[-_]?key|private[-_]?key|[A-Za-z][A-Za-z0-9_.-]*(?:password|passwd|token|secret|credential|api[-_]?key|access[-_]?key|private[-_]?key))`;
  const CREDENTIAL_VALUE = String.raw`(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;}\]]+)`;
  const CREDENTIAL_ASSIGNMENT = new RegExp(String.raw`(\b${CREDENTIAL_KEY}\b\s*(?:=|:)\s*)${CREDENTIAL_VALUE}`, 'gi');
  const CREDENTIAL_DISCLOSURE = new RegExp(String.raw`(\b${CREDENTIAL_KEY}\b\s+(?:is|was)\s+)${CREDENTIAL_VALUE}`, 'gi');
  const AUTHORIZATION_VALUE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
  const URI_CREDENTIAL = /(\/\/[^/\s:@]+:)([^@/\s]+)(@)/g;
  const QUERY_CREDENTIAL = /([?&](?:access_token|token|auth|api[_-]?key|password|secret)=)([^&#\s]+)/gi;
  const UNSAFE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

  function byteLength(value) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') return Buffer.byteLength(value, 'utf8');
    if (encoder) return encoder.encode(value).byteLength;
    return value.length;
  }

  function responseText(value) {
    return typeof value === 'string' ? value : '';
  }

  function replaceLiteral(value, needle, replacement) {
    if (!needle) return { text: value, changed: false };
    const first = value.indexOf(needle);
    if (first < 0) return { text: value, changed: false };
    let result = '';
    let cursor = 0;
    let index = first;
    while (index >= 0) {
      result += value.slice(cursor, index);
      result += replacement;
      cursor = index + needle.length;
      index = value.indexOf(needle, cursor);
    }
    result += value.slice(cursor);
    return { text: result, changed: true };
  }

  function secretVariants(secrets) {
    const variants = new Set();
    for (const secret of Array.isArray(secrets) ? secrets : []) {
      if (typeof secret !== 'string' || secret.length === 0) continue;
      variants.add(secret);
      try {
        const encoded = encodeURIComponent(secret);
        if (encoded) {
          variants.add(encoded);
          variants.add(encoded.replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase()));
        }
      } catch {
        // A malformed value is never rendered as an error detail.
      }
    }
    return [...variants].sort((left, right) => right.length - left.length);
  }

  function replacePattern(value, pattern, replacement) {
    const text = value.replace(pattern, replacement);
    return { text, changed: text !== value };
  }

  function redactCredentials(value, secrets) {
    let text = value;
    let redacted = false;
    for (const secret of secretVariants(secrets)) {
      const result = replaceLiteral(text, secret, REDACTION_MARKER);
      text = result.text;
      redacted = redacted || result.changed;
    }
    for (const [pattern, replacement] of [
      [CREDENTIAL_ASSIGNMENT, '$1[redacted]'],
      [CREDENTIAL_DISCLOSURE, '$1[redacted]'],
      [AUTHORIZATION_VALUE, '$1 [redacted]'],
      [URI_CREDENTIAL, '$1[redacted]$3'],
      [QUERY_CREDENTIAL, '$1[redacted]']
    ]) {
      const result = replacePattern(text, pattern, replacement);
      text = result.text;
      redacted = redacted || result.changed;
    }
    return { text, redacted };
  }

  function neutralizeControls(value) {
    const normalizedLines = value.replace(/\r\n?/g, '\n');
    const text = normalizedLines.replace(UNSAFE_CONTROL, '\uFFFD');
    return { text, sanitized: text !== value };
  }

  function truncateUtf8(value, limit) {
    if (byteLength(value) <= limit) return { text: value, truncated: false };
    let bytes = 0;
    let result = '';
    for (const character of value) {
      const size = byteLength(character);
      if (bytes + size > limit) break;
      result += character;
      bytes += size;
    }
    return { text: result, truncated: true };
  }

  function createSafeRconResponse(value, options = {}) {
    const suppliedText = responseText(value);
    const withheldUnexpectedValue = value !== undefined && value !== null && typeof value !== 'string';
    const redaction = redactCredentials(suppliedText, options.secrets);
    const normalized = neutralizeControls(redaction.text);
    const bounded = truncateUtf8(normalized.text, MAX_PRESENTATION_BYTES);
    return Object.freeze({
      version: RESPONSE_VERSION,
      kind: RESPONSE_KIND,
      text: bounded.text,
      redacted: Boolean(options.forceRedacted || withheldUnexpectedValue || redaction.redacted),
      truncated: Boolean(options.forceTruncated || bounded.truncated),
      sanitized: Boolean(options.forceSanitized || withheldUnexpectedValue || normalized.sanitized)
    });
  }

  function isSafeRconResponse(value) {
    return Boolean(value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.version === RESPONSE_VERSION
      && value.kind === RESPONSE_KIND
      && typeof value.text === 'string');
  }

  function normalizeRconIpcResponse(value) {
    if (!isSafeRconResponse(value)) {
      return createSafeRconResponse('', { forceRedacted: true, forceSanitized: true });
    }
    return createSafeRconResponse(value.text, {
      forceRedacted: value.redacted === true,
      forceTruncated: value.truncated === true,
      forceSanitized: value.sanitized === true
    });
  }

  function responseMarkers(value) {
    const response = normalizeRconIpcResponse(value);
    const markers = [];
    if (response.redacted) markers.push(REDACTION_MARKER);
    if (response.sanitized) markers.push(SANITIZATION_MARKER);
    if (response.truncated) markers.push(TRUNCATION_MARKER);
    return markers;
  }

  function safeRconErrorMessage(error, options = {}) {
    const detail = createSafeRconResponse(error && typeof error.message === 'string' ? error.message : '', options);
    const markers = responseMarkers(detail);
    const prefix = markers.length ? `${markers.join(' ')} ` : '';
    return `${prefix}${detail.text || 'The RCON operation did not provide a displayable error detail.'}`;
  }

  return Object.freeze({
    MAX_PRESENTATION_BYTES,
    REDACTION_MARKER,
    RESPONSE_KIND,
    RESPONSE_VERSION,
    SANITIZATION_MARKER,
    TRUNCATION_MARKER,
    createSafeRconResponse,
    isSafeRconResponse,
    normalizeRconIpcResponse,
    responseMarkers,
    safeRconErrorMessage
  });
});
