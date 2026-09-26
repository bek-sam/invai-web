export interface SlotBox {
  wIn: number;
  hIn: number;
  fontSizePt: number;
  /** Absolute shrink floor in points; the larger of this and 60% of `fontSizePt` wins. */
  minFontSizePt?: number | null;
  /** Text wraps up to this many lines; null/undefined means unlimited. */
  maxLines?: number | null;
  maxChars: number | null;
  uppercase: boolean;
}

export interface FitResult {
  lines: string[];
  /** Font size after auto-shrink, in points. */
  fontSizePt: number;
  scale: number;
  overflow: boolean;
  tooLong: boolean;
}

/** Average glyph width as a share of the font size; good enough for a live preview. */
const GLYPH_RATIO = 0.56;
const LINE_RATIO = 1.2; // approx line height as a share of font size
const MIN_SCALE = 0.6;
const SCALE_STEP = 0.05;

function wrap(text: string, maxCharsPerLine: number): string[] {
  const [first, ...rest] = text.split(/\s+/).filter(Boolean);
  if (first === undefined) return [text];
  const lines: string[] = [first];
  for (const w of rest) {
    const trial = `${lines[lines.length - 1]} ${w}`;
    if (trial.length <= maxCharsPerLine) lines[lines.length - 1] = trial;
    else lines.push(w);
  }
  return lines;
}

function linesAt(text: string, slot: SlotBox, scale: number) {
  const fontSizePt = slot.fontSizePt * scale;
  const maxCharsPerLine = Math.max(1, Math.floor((slot.wIn * 72) / (fontSizePt * GLYPH_RATIO)));
  const lines = wrap(text, maxCharsPerLine);
  const lineHeightIn = (fontSizePt * LINE_RATIO) / 72;
  const fits =
    lines.length * lineHeightIn <= slot.hIn && lines.every((l) => l.length <= maxCharsPerLine);
  return { lines, fontSizePt, fits };
}

/**
 * Mirrors imaging's rule for the live editor preview: text wraps within the box (bounded by
 * `maxLines`) and shrinks to fit, down to the larger of 60% of `fontSizePt` and
 * `minFontSizePt`. Past that floor it's clipped to `maxLines` and flagged overflow. The server
 * render stays authoritative.
 */
export function fitSlotText(slot: SlotBox, raw: string): FitResult {
  const text = slot.uppercase ? raw.toUpperCase() : raw;
  const tooLong = slot.maxChars !== null && text.length > slot.maxChars;
  const floorScale = slot.minFontSizePt
    ? Math.max(MIN_SCALE, Math.min(1, slot.minFontSizePt / slot.fontSizePt))
    : MIN_SCALE;
  const maxLines = slot.maxLines ?? Number.POSITIVE_INFINITY;

  for (let scale = 1; scale >= floorScale - 1e-9; scale -= SCALE_STEP) {
    const { lines, fontSizePt, fits } = linesAt(text, slot, scale);
    if (fits && lines.length <= maxLines) {
      return { lines, fontSizePt, scale, overflow: false, tooLong };
    }
  }
  const { lines, fontSizePt } = linesAt(text, slot, floorScale);
  return {
    lines: Number.isFinite(maxLines) ? lines.slice(0, maxLines) : lines,
    fontSizePt,
    scale: floorScale,
    overflow: true,
    tooLong,
  };
}
