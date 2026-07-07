import { useState, type ReactNode } from "react";
import Button from "react-bootstrap/Button";

interface CollapsiblePanelProps {
  /** Heading shown on the left of the panel header bar. */
  title: string;
  /** Unique id linking the toggle to its region (aria-controls). */
  id: string;
  /** Panel body, rendered only while expanded. */
  children: ReactNode;
  /** Whether the panel starts expanded (default true). */
  defaultOpen?: boolean;
  /** Optional count shown on the "Open (N)" button while collapsed. */
  badge?: number;
}

/**
 * A titled, collapsible container used for the room's side panels (Chat and
 * Found sets) so they share one consistent, accessible expand/collapse control.
 * Collapsing frees vertical space (handy on small screens) without disturbing
 * the rest of the row.
 */
export function CollapsiblePanel({ title, id, children, defaultOpen = true, badge }: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`panel-shell${open ? "" : " is-collapsed"}`}>
      <div className="panel-header">
        <h2 className="h5 mb-0">{title}</h2>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
        >
          {open ? "Collapse" : badge !== undefined ? `Open (${badge})` : "Open"}
        </Button>
      </div>
      {open && <div id={id}>{children}</div>}
    </section>
  );
}
