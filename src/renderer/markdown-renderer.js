'use strict';

// A deliberately small Markdown renderer for bundled, app-owned documentation.
// It never interprets source as HTML: every output node is built with DOM APIs
// and every source string reaches the DOM through textContent.
(function installStudioMarkdownRenderer(global) {
  const LIMITS = Object.freeze({
    sourceCharacters: 128 * 1024,
    sourceLines: 4_000,
    blocks: 1_200,
    codeLines: 1_200,
    inlineTokens: 8_000,
    linkCharacters: 2_048,
    targetCharacters: 256,
  });

  const EXTERNAL_LINK = /^(?:https?:\/\/|mailto:)/i;
  const UNSAFE_LINK = /^(?:javascript|data|vbscript|file|ftp):/i;
  const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
  const FENCE = /^\s{0,3}```\s*([A-Za-z0-9+._-]{0,64})\s*$/;
  const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/;
  const UNORDERED_LIST = /^\s*[-+*]\s+(.+?)\s*$/;
  const ORDERED_LIST = /^\s*(\d{1,9})[.)]\s+(.+?)\s*$/;

  function sourceText(value) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '\uFFFD');
    const truncated = normalized.length > LIMITS.sourceCharacters;
    const bounded = truncated ? normalized.slice(0, LIMITS.sourceCharacters) : normalized;
    const lines = bounded.split('\n');

    if (lines.length <= LIMITS.sourceLines) {
      return { text: bounded, truncated };
    }

    return {
      text: lines.slice(0, LIMITS.sourceLines).join('\n'),
      truncated: true,
    };
  }

  function appendText(parent, text) {
    if (text) parent.appendChild(parent.ownerDocument.createTextNode(text));
  }

  function isBlank(line) {
    return /^\s*$/.test(line);
  }

  function fenceStart(line) {
    return FENCE.exec(line);
  }

  function headingMatch(line) {
    return HEADING.exec(line);
  }

  function listMatch(line) {
    const unordered = UNORDERED_LIST.exec(line);
    if (unordered) return { type: 'ul', text: unordered[1] };

    const ordered = ORDERED_LIST.exec(line);
    if (ordered) return { type: 'ol', start: Number(ordered[1]), text: ordered[2] };

    return null;
  }

  function isBlockStart(line) {
    return Boolean(fenceStart(line) || headingMatch(line) || listMatch(line));
  }

  function safeInternalTarget(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const anchor = typeof candidate.anchor === 'string' ? candidate.anchor.trim() : '';
    if (!id || id.length > LIMITS.targetCharacters || CONTROL_CHARACTER.test(id)) return null;
    if (anchor.length > LIMITS.targetCharacters || CONTROL_CHARACTER.test(anchor)) return null;

    return Object.freeze({ id, anchor });
  }

  function resolveInternalTarget(href, options) {
    if (typeof options.resolveInternalLink !== 'function') return null;

    try {
      return safeInternalTarget(options.resolveInternalLink(href));
    } catch {
      // A documentation navigation resolver is optional. A resolver failure must
      // not turn an untrusted Markdown link into a browser navigation.
      return null;
    }
  }

  function externalHref(href) {
    const value = href.trim();
    if (!value || value.length > LIMITS.linkCharacters || CONTROL_CHARACTER.test(value)) return null;
    if (UNSAFE_LINK.test(value) || !EXTERNAL_LINK.test(value)) return null;
    return value;
  }

  function findClosing(text, marker, from) {
    let cursor = from;
    while (cursor < text.length) {
      const found = text.indexOf(marker, cursor);
      if (found < 0) return -1;
      if (found === 0 || text[found - 1] !== '\\') return found;
      cursor = found + marker.length;
    }
    return -1;
  }

  function appendLink(parent, label, href, state) {
    const internalTarget = resolveInternalTarget(href, state.options);
    if (internalTarget) {
      const link = parent.ownerDocument.createElement('a');
      link.href = `#${encodeURIComponent(internalTarget.id)}`;
      link.dataset.markdownInternalLink = internalTarget.id;
      if (internalTarget.anchor) link.dataset.markdownInternalAnchor = internalTarget.anchor;
      appendInline(link, label, state);
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof state.options.onInternalLink !== 'function') return;
        try {
          state.options.onInternalLink(internalTarget);
        } catch {
          // Parent-owned navigation failures stay inside the parent. The rendered
          // document remains safe and usable as ordinary text.
          link.setAttribute('aria-invalid', 'true');
        }
      });
      parent.appendChild(link);
      state.internalLinks += 1;
      return;
    }

    const external = externalHref(href);
    if (external) {
      const link = parent.ownerDocument.createElement('a');
      link.href = external;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.setAttribute('referrerpolicy', 'no-referrer');
      appendInline(link, label, state);
      parent.appendChild(link);
      return;
    }

    // Unresolved relative links and unsafe schemes are text, not a capability.
    appendInline(parent, label, state);
  }

  function appendInline(parent, source, state) {
    const text = String(source ?? '');
    let cursor = 0;
    let plainStart = 0;

    function flushPlain(end) {
      if (end > plainStart) appendText(parent, text.slice(plainStart, end));
    }

    while (cursor < text.length) {
      if (state.inlineTokens >= LIMITS.inlineTokens) {
        flushPlain(cursor);
        appendText(parent, text.slice(cursor));
        state.warnings.add('Inline formatting reached the renderer safety limit.');
        return;
      }

      const character = text[cursor];

      if (character === '\\' && cursor + 1 < text.length) {
        flushPlain(cursor);
        appendText(parent, text[cursor + 1]);
        cursor += 2;
        plainStart = cursor;
        state.inlineTokens += 1;
        continue;
      }

      if (character === '`') {
        const close = findClosing(text, '`', cursor + 1);
        if (close > cursor + 1) {
          flushPlain(cursor);
          const code = parent.ownerDocument.createElement('code');
          code.textContent = text.slice(cursor + 1, close);
          parent.appendChild(code);
          cursor = close + 1;
          plainStart = cursor;
          state.inlineTokens += 1;
          continue;
        }
      }

      if (character === '[') {
        const labelEnd = text.indexOf('](', cursor + 1);
        if (labelEnd > cursor + 1) {
          const destinationEnd = text.indexOf(')', labelEnd + 2);
          if (destinationEnd > labelEnd + 2) {
            flushPlain(cursor);
            const label = text.slice(cursor + 1, labelEnd);
            let href = text.slice(labelEnd + 2, destinationEnd).trim();
            if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1).trim();
            appendLink(parent, label, href, state);
            cursor = destinationEnd + 1;
            plainStart = cursor;
            state.inlineTokens += 1;
            continue;
          }
        }
      }

      if (character === '*' || character === '_') {
        const strong = text[cursor + 1] === character;
        const marker = strong ? character.repeat(2) : character;
        const contentStart = cursor + marker.length;
        const close = findClosing(text, marker, contentStart);
        const inside = close > contentStart ? text.slice(contentStart, close) : '';
        const intraWordUnderscore = character === '_' && /[A-Za-z0-9]/.test(text[cursor - 1] || '');

        if (inside && !intraWordUnderscore) {
          flushPlain(cursor);
          const element = parent.ownerDocument.createElement(strong ? 'strong' : 'em');
          appendInline(element, inside, state);
          parent.appendChild(element);
          cursor = close + marker.length;
          plainStart = cursor;
          state.inlineTokens += 1;
          continue;
        }
      }

      cursor += 1;
    }

    flushPlain(text.length);
  }

  function renderHeading(fragment, match, state) {
    const level = match[1].length;
    const element = state.document.createElement(`h${level}`);
    const content = match[2].replace(/[ \t]+#+[ \t]*$/, '');
    appendInline(element, content, state);
    fragment.appendChild(element);
  }

  function renderCodeBlock(fragment, lines, start, opening, state) {
    const pre = state.document.createElement('pre');
    const code = state.document.createElement('code');
    const language = opening[1] || '';
    if (language) code.className = `language-${language}`;

    const captured = [];
    let cursor = start + 1;
    let closed = false;
    let omitted = false;

    while (cursor < lines.length) {
      if (/^\s{0,3}```\s*$/.test(lines[cursor])) {
        closed = true;
        cursor += 1;
        break;
      }

      if (captured.length < LIMITS.codeLines) {
        captured.push(lines[cursor]);
      } else {
        omitted = true;
      }
      cursor += 1;
    }

    code.textContent = captured.join('\n');
    pre.appendChild(code);
    fragment.appendChild(pre);

    if (!closed) state.warnings.add('An unterminated fenced code block was rendered as code.');
    if (omitted) state.warnings.add('A fenced code block exceeded the renderer line limit.');
    return cursor;
  }

  function renderList(fragment, lines, start, first, state) {
    const list = state.document.createElement(first.type);
    if (first.type === 'ol' && first.start !== 1) list.start = first.start;

    let cursor = start;
    while (cursor < lines.length) {
      const match = listMatch(lines[cursor]);
      if (!match || match.type !== first.type) break;

      const item = state.document.createElement('li');
      appendInline(item, match.text, state);
      list.appendChild(item);
      cursor += 1;
    }

    fragment.appendChild(list);
    return cursor;
  }

  function renderParagraph(fragment, lines, start, state) {
    const parts = [];
    let cursor = start;
    while (cursor < lines.length && !isBlank(lines[cursor]) && !isBlockStart(lines[cursor])) {
      parts.push(lines[cursor].trim());
      cursor += 1;
    }

    if (parts.length) {
      const paragraph = state.document.createElement('p');
      appendInline(paragraph, parts.join(' '), state);
      fragment.appendChild(paragraph);
    }
    return cursor;
  }

  function appendNotice(fragment, state) {
    if (!state.warnings.size) return;
    const notice = state.document.createElement('aside');
    notice.className = 'markdown-renderer-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = Array.from(state.warnings).join(' ');
    fragment.appendChild(notice);
  }

  function render(container, markdown, options = {}) {
    if (!container || typeof container.replaceChildren !== 'function' || !container.ownerDocument) {
      throw new TypeError('StudioMarkdownRenderer.render requires a DOM container.');
    }

    const normalized = sourceText(markdown);
    const state = {
      document: container.ownerDocument,
      options: options && typeof options === 'object' ? options : {},
      warnings: new Set(),
      inlineTokens: 0,
      internalLinks: 0,
      renderedBlocks: 0,
    };
    if (normalized.truncated) {
      state.warnings.add('The Markdown document exceeded the renderer input limit; remaining content was not rendered.');
    }

    const fragment = state.document.createDocumentFragment();
    const lines = normalized.text.split('\n');
    let cursor = 0;

    while (cursor < lines.length && state.renderedBlocks < LIMITS.blocks) {
      if (isBlank(lines[cursor])) {
        cursor += 1;
        continue;
      }

      const openingFence = fenceStart(lines[cursor]);
      if (openingFence) {
        cursor = renderCodeBlock(fragment, lines, cursor, openingFence, state);
        state.renderedBlocks += 1;
        continue;
      }

      const heading = headingMatch(lines[cursor]);
      if (heading) {
        renderHeading(fragment, heading, state);
        cursor += 1;
        state.renderedBlocks += 1;
        continue;
      }

      const list = listMatch(lines[cursor]);
      if (list) {
        cursor = renderList(fragment, lines, cursor, list, state);
        state.renderedBlocks += 1;
        continue;
      }

      const previous = cursor;
      cursor = renderParagraph(fragment, lines, cursor, state);
      if (cursor === previous) {
        // Defensive progress guarantee for an unexpected line shape.
        const paragraph = state.document.createElement('p');
        appendText(paragraph, lines[cursor]);
        fragment.appendChild(paragraph);
        cursor += 1;
      }
      state.renderedBlocks += 1;
    }

    if (cursor < lines.length) {
      state.warnings.add('The Markdown document exceeded the renderer block limit; remaining content was not rendered.');
    }
    appendNotice(fragment, state);
    container.replaceChildren(fragment);

    return Object.freeze({
      renderedBlocks: state.renderedBlocks,
      internalLinks: state.internalLinks,
      warnings: Object.freeze(Array.from(state.warnings)),
      truncated: normalized.truncated || cursor < lines.length,
    });
  }

  global.StudioMarkdownRenderer = Object.freeze({
    render,
    limits: LIMITS,
  });
}(globalThis));
