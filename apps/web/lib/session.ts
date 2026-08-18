export interface AnonSession {
  userId: string;
  /** Proves ownership of userId on reconnect — never shown to other players. */
  sessionToken: string;
  displayName: string;
  roomCode: string;
}

const KEY = 'mafia:session';

export function saveSession(session: AnonSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadSession(): AnonSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnonSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
