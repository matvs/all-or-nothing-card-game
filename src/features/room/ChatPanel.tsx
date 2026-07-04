import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { CHAT_MAX_LENGTH, type ChatMessage } from "../../../shared/protocol.js";

/**
 * Room text chat. Renders the message log (author coloured by their seat) and a
 * send box. Messages travel over the same WebSocket connection as the game.
 */
export function ChatPanel({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the log pinned to the newest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputRef.current?.value ?? "";
    if (value.trim()) {
      onSend(value);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="chat" aria-label="Room chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="chat__system">No messages yet. Say hello!</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="chat__msg">
              <span className="chat__author" style={{ color: m.color ?? undefined }}>
                {m.name}:
              </span>{" "}
              <span>{m.text}</span>
            </div>
          ))
        )}
      </div>
      <Form className="chat__form" onSubmit={submit}>
        <Form.Control
          ref={inputRef}
          type="text"
          placeholder="Type a message…"
          maxLength={CHAT_MAX_LENGTH}
          aria-label="Chat message"
          autoComplete="off"
        />
        <Button type="submit" variant="primary">
          Send
        </Button>
      </Form>
    </div>
  );
}
