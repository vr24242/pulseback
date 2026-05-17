import { franc } from "franc"

// ISO 639-3 → our internal language codes
const LANG_MAP: Record<string, string> = {
  hin: "hindi",
  tam: "tamil",
  tel: "telugu",
  kan: "kannada",
  mal: "malayalam",
  mar: "marathi",
  guj: "gujarati",
  pan: "punjabi",
  ben: "bengali",
  eng: "english",
  und: "unknown",
}

// Languages that need Sarvam AI for generation (regional Indian)
const REGIONAL_LANGUAGES = new Set([
  "hindi", "tamil", "telugu", "kannada", "malayalam",
  "marathi", "gujarati", "punjabi", "bengali",
])

export type DetectedLanguage = {
  code: string        // "hindi" | "english" | "tamil" | etc.
  iso: string         // raw ISO 639-3 code from franc
  isRegional: boolean // true → use Sarvam AI for response generation
  needsSarvam: boolean // alias for isRegional, explicit intent
}

/**
 * Detect language of incoming WhatsApp message.
 * Uses franc (pure JS, no model file, works in worker process).
 * Falls back to "english" for short messages or unknown.
 *
 * @param text — raw message text from customer
 * @returns DetectedLanguage
 */
export function detectLanguage(text: string): DetectedLanguage {
  // franc needs at least ~10 chars for reliable detection
  // Short messages like "yes", "ok", "1" → treat as English (intent handled by regex)
  if (text.trim().length < 10) {
    return { code: "english", iso: "eng", isRegional: false, needsSarvam: false }
  }

  const iso = franc(text, {
    // Prioritise Indian languages + English
    only: ["hin", "tam", "tel", "kan", "mal", "mar", "guj", "pan", "ben", "eng"],
    minLength: 5,
  })

  const code = LANG_MAP[iso] ?? "english"
  const isRegional = REGIONAL_LANGUAGES.has(code)

  return {
    code,
    iso: iso === "und" ? "eng" : iso,
    isRegional,
    needsSarvam: isRegional,
  }
}

/**
 * Quick check — is this message in a regional Indian language?
 * Use this for the fast path decision in the webhook handler.
 */
export function isRegionalLanguage(text: string): boolean {
  return detectLanguage(text).isRegional
}
