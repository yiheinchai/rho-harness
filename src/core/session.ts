import { id, nowIso } from "./ids.ts";
import type { GuestSession } from "./types.ts";

export class SessionStore {
  private sessions = new Map<string, GuestSession>();

  create<TState>(workflowId: string, state: TState, channel: GuestSession["channel"] = "web"): GuestSession<TState> {
    const session: GuestSession<TState> = {
      id: id("ses"),
      workflowId,
      channel,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
      state,
    };
    this.sessions.set(session.id, session as GuestSession);
    return session;
  }

  get<TState = Record<string, unknown>>(sessionId: string): GuestSession<TState> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session ${sessionId}`);
    return session as GuestSession<TState>;
  }

  save(session: GuestSession): GuestSession {
    session.updatedAt = nowIso();
    this.sessions.set(session.id, session);
    return session;
  }

  list(): GuestSession[] {
    return [...this.sessions.values()];
  }
}
