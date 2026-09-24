export interface SlotBox {
  wIn: number;
  hIn: number;
  fontSizePt: number;
  maxChars: number | null;
  uppercase: boolean;
}

export interface FitResult {
  text: string;
  /** Font size after auto-shrink, in points. */
  fontSizePt: number;
  scale: number;
  overflow: boolean;
  tooLong: boolean;
}

/** Average glyph width as a share of the font size; good enough for a live preview. */
const GLYPH_RATIO = 0.56;
const MIN_SCALE = 0.6;

/**
 * Mirrors imaging's rule for the live editor preview: text shrinks to fit the slot down to
 * 60% of its size, then is flagged as overflow. The server render stays authoritative.
 */
export function fitSlotText(slot: SlotBox, raw: string): FitResult {
  const text = slot.uppercase ? raw.toUpperCase() : raw;
  const tooLong = slot.maxChars !== null && text.length > slot.maxChars;
  const widthIn = (text.length * slot.fontSizePt * GLYPH_RATIO) / 72;
  const heightIn = slot.fontSizePt / 72;
  const scaleW = widthIn > 0 ? slot.wIn / widthIn : 1;
  const scaleH = heightIn > 0 ? slot.hIn / heightIn : 1;
  const needed = Math.min(1, scaleW, scaleH);
  const scale = Math.max(MIN_SCALE, needed);
  return {
    text,
    fontSizePt: slot.fontSizePt * scale,
    scale,
    overflow: needed < MIN_SCALE,
    tooLong,
  };
}
