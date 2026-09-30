import type { ReviewEvent } from "./engine";

/**
 * SSE wire format, shared by the route and the browser. SPEC.md §7.6.
 *
 * Kept in one module so the encoder and the parser cannot drift: a mismatch
 * would look like a review that silently produces nothing.
 */

export const HEARTBEAT_MS = 15_000;

export function encodeEvent(event: ReviewEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const HEARTBEAT_FRAME = ": heartbeat\n\n";

/**
 * Incremental SSE parser. Feed it chunks; it returns whatever complete events
 * the buffer now contains and keeps the remainder for the next call.
 */
export class EventStreamParser {
  private buffer = "";

  push(chunk: string): ReviewEvent[] {
    this.buffer += chunk;
    const events: ReviewEvent[] = [];

    // Frames are separated by a blank line. A partial frame stays buffered.
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const parsed = parseFrame(frame);
      if (parsed) events.push(parsed);
      boundary = this.buffer.indexOf("\n\n");
    }

    return events;
  }
}

function parseFrame(frame: string): ReviewEvent | null {
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    // Comments (": heartbeat") carry no data and exist only to hold the
    // connection open.
    if (line.startsWith(":")) continue;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;

  try {
    const parsed = JSON.parse(dataLines.join("\n"));
    return typeof parsed === "object" && parsed !== null && "type" in parsed
      ? (parsed as ReviewEvent)
      : null;
  } catch {
    // A malformed frame is dropped rather than failing the whole stream; the
    // run is still producing events.
    return null;
  }
}
