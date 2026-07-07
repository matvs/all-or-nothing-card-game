/**
 * Push-to-talk helpers, now sourced from the shared `@matvs/core-realtime` voice
 * module so every Matvs app shares one implementation. Re-exported here so the
 * room UI (VoiceBar) and this app's tests keep their existing import path.
 *
 * The V key, the case-insensitive match, the typing-surface guard (so chat input
 * never opens the mic) and the `bindPushToTalk` window binding all live in
 * `@matvs/core-realtime/voice`.
 */

export {
  PUSH_TO_TALK_KEY,
  PUSH_TO_TALK_KEY_LABEL,
  isPushToTalkKey,
  isTypingTag,
  isTypingTarget,
  bindPushToTalk,
} from "@matvs/core-realtime/voice";
export type { PushToTalkOptions } from "@matvs/core-realtime/voice";
