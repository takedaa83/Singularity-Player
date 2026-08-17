/**
 * TTML (Timed Text Markup Language) & Syllable-Level Lyrics Parser
 * Inspired by Better Lyrics (https://github.com/better-lyrics/better-lyrics)
 * Supports word/syllable spans, multi-singer agents, and background vocal roles.
 */

export interface TtmlWord {
  word: string;
  start: number; // milliseconds
  end: number;   // milliseconds
  isBackground?: boolean;
  hasTrailingSpace?: boolean;
}

export interface TtmlLine {
  time: number; // seconds
  endTime?: number; // seconds
  text: string;
  words?: TtmlWord[];
  backgroundWords?: TtmlWord[];
  singer?: string; // 'v1' | 'v2' | string
  isBackground?: boolean; // ad-lib / backing vocal
  translation?: string;
  romanization?: string;
}

export interface TtmlParseResult {
  lines: TtmlLine[];
  isSyllableSynced: boolean;
  isWordSynced: boolean;
  hasMultiSinger: boolean;
  hasBackgroundVocals: boolean;
}

/**
 * Parses timestamp string (e.g. "01:23.450", "00:01:23.450", "12.34s", "1234ms") to milliseconds.
 */
export function parseTimestampToMs(timeStr: string | null | undefined): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();

  // "12.34s"
  if (trimmed.endsWith('s') && !trimmed.includes(':')) {
    return parseFloat(trimmed.slice(0, -1)) * 1000;
  }
  // "1234ms"
  if (trimmed.endsWith('ms')) {
    return parseFloat(trimmed.slice(0, -2));
  }

  // "MM:SS.xxx" or "HH:MM:SS.xxx"
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const sec = parseFloat(parts[1]);
    return (min * 60 + sec) * 1000;
  }
  if (parts.length === 3) {
    const hr = parseFloat(parts[0]);
    const min = parseFloat(parts[1]);
    const sec = parseFloat(parts[2]);
    return (hr * 3600 + min * 60 + sec) * 1000;
  }

  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num * 1000;
}

/**
 * Parses TTML XML into structured syllable-synchronized lines.
 */
export function parseTTML(ttmlString: string): TtmlParseResult | null {
  if (!ttmlString || typeof ttmlString !== 'string') return null;
  const clean = ttmlString.trim();
  if (!clean.includes('<tt') && !clean.includes('<p ') && !clean.includes('<span ')) {
    return null;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('[TTMLParser] XML parse error, attempting HTML parser fallback');
      const htmlDoc = parser.parseFromString(clean, 'text/html');
      return extractLinesFromDoc(htmlDoc);
    }
    return extractLinesFromDoc(doc);
  } catch (err) {
    console.error('[TTMLParser] Failed to parse TTML:', err);
    return null;
  }
}

function extractLinesFromDoc(doc: Document): TtmlParseResult {
  const pElements = doc.querySelectorAll('p');
  const lines: TtmlLine[] = [];
  let isSyllableSynced = false;
  let isWordSynced = false;
  let hasMultiSinger = false;
  let hasBackgroundVocals = false;

  pElements.forEach((p) => {
    const beginAttr = p.getAttribute('begin') || p.getAttribute('data-begin');
    const endAttr = p.getAttribute('end') || p.getAttribute('data-end');
    const agentAttr = p.getAttribute('ttm:agent') || p.getAttribute('agent') || p.getAttribute('data-singer');
    const roleAttr = p.getAttribute('ttm:role') || p.getAttribute('role');

    const lineStartMs = parseTimestampToMs(beginAttr);
    const lineEndMs = parseTimestampToMs(endAttr);
    const isLineBg = roleAttr === 'x-bg' || roleAttr === 'background' || p.classList.contains('background');

    if (agentAttr) hasMultiSinger = true;
    if (isLineBg) hasBackgroundVocals = true;

    const spanElements = p.querySelectorAll('span');
    const words: TtmlWord[] = [];
    const bgWords: TtmlWord[] = [];
    let lineText = '';

    if (spanElements.length > 0) {
      isWordSynced = true;
      spanElements.forEach((span) => {
        const spanBegin = span.getAttribute('begin') || span.getAttribute('data-begin');
        const spanEnd = span.getAttribute('end') || span.getAttribute('data-end');
        const spanRole = span.getAttribute('ttm:role') || span.getAttribute('role');
        const isSpanBg = spanRole === 'x-bg' || isLineBg;

        const wStart = spanBegin ? parseTimestampToMs(spanBegin) : lineStartMs;
        const wEnd = spanEnd ? parseTimestampToMs(spanEnd) : (lineEndMs || wStart + 300);
        const rawSpanText = span.textContent || '';
        const hasTrailing = /\s$/.test(rawSpanText) || span.nextSibling?.nodeType === Node.TEXT_NODE;
        const trimmedSpanText = rawSpanText.trim();

        if (trimmedSpanText) {
          // If span contains word without spaces, check if syllable
          if (trimmedSpanText.length > 0 && !trimmedSpanText.includes(' ')) {
            isSyllableSynced = true;
          }

          const wordObj: TtmlWord = {
            word: trimmedSpanText,
            start: wStart,
            end: wEnd,
            isBackground: isSpanBg,
            hasTrailingSpace: hasTrailing
          };

          if (isSpanBg && !isLineBg) {
            bgWords.push(wordObj);
          } else {
            words.push(wordObj);
          }
        }
      });

      lineText = Array.from(spanElements).map(s => s.textContent).join('');
    } else {
      lineText = p.textContent || '';
    }

    if (lineText.trim()) {
      lines.push({
        time: lineStartMs / 1000,
        endTime: lineEndMs ? lineEndMs / 1000 : undefined,
        text: lineText.trim(),
        words: words.length > 0 ? words : undefined,
        backgroundWords: bgWords.length > 0 ? bgWords : undefined,
        singer: agentAttr || undefined,
        isBackground: isLineBg,
      });
    }
  });

  lines.sort((a, b) => a.time - b.time);

  return {
    lines,
    isSyllableSynced,
    isWordSynced,
    hasMultiSinger,
    hasBackgroundVocals
  };
}
