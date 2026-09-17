import { redactUnknown } from "./pii.ts";
import type { AuditEvent } from "./types.ts";

export class AuditLog {
  private events: AuditEvent[] = [];

  record(event: AuditEvent): AuditEvent {
    const safe: AuditEvent = {
      ...event,
      summary: String(redactUnknown(event.summary)),
      data: event.data === undefined ? undefined : redactUnknown(event.data),
    };
    this.events.push(safe);
    return safe;
  }

  list(sessionId?: string): AuditEvent[] {
    return sessionId ? this.events.filter((event) => event.sessionId === sessionId) : [...this.events];
  }
}
