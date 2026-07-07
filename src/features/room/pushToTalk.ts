/**
 * Push-to-talk key helpers, kept as pure functions so they can be unit-tested
 * without a DOM. The room's voice hook (useVoice) wires these to real window
 * key events; VoiceBar shows the matching on-screen indicator and key hint.
 */

/** The keyboard key a player holds to open the mic ("push to talk"). */
export const PUSH_TO_TALK_KEY = "v";

/** Upper-case label for the push-to-talk key, for on-screen hints. */
export const PUSH_TO_TALK_KEY_LABEL = PUSH_TO_TALK_KEY.toUpperCase();

/** True when a KeyboardEvent.key is the push-to-talk key (case-insensitive). */
export function isPushToTalkKey(key: string): boolean {
  return key.toLowerCase() === PUSH_TO_TALK_KEY;
}

/**
 * True for element tag names that accept text entry, so holding the talk key
 * while typing in chat types a letter instead of opening the mic.
 */
export function isTypingTag(tagName: string | null | undefined): boolean {
  if (!tagName) return false;
  const tag = tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * DOM adapter for {@link isTypingTag}: is the event target a text-entry surface
 * (input/textarea/select or any contenteditable node)? Lives here so useVoice
 * stays declarative; the pure helpers above carry the unit-tested logic.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return isTypingTag(target.tagName);
}
