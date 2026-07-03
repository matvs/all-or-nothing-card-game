import { CHAT_MAX_LENGTH, NAME_MAX_LENGTH } from "../shared/protocol.js";

export function sanitizeName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  const trimmed = text.slice(0, NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : "Player";
}

export function sanitizeChatText(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0) return null;
  return text.slice(0, CHAT_MAX_LENGTH);
}
