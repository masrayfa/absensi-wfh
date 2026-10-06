import { useSyncExternalStore } from 'react';

/** Mirrors `Role` in @app/contracts (type-only, so the web bundle never pulls class-validator). */
export type UserRole = 'EMPLOYEE' | 'HRD';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
}

const STORAGE_KEY = 'absensi.session';

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed.accessToken && parsed.user?.role ? parsed : null;
  } catch {
    return null;
  }
}

let current: Session | null = read();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session): void {
  current = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  emit();
}

export function clearSession(): void {
  current = null;
  localStorage.removeItem(STORAGE_KEY);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession);
}
