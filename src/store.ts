import { randomBytes } from 'node:crypto';

export class TtlMap<K, V> {
  private map = new Map<K, { value: V; timer?: ReturnType<typeof setTimeout> }>();

  constructor(private ttlMs?: number) {}

  set(key: K, value: V): void {
    this.delete(key);
    const entry: { value: V; timer?: ReturnType<typeof setTimeout> } = { value };
    if (this.ttlMs) {
      entry.timer = setTimeout(() => this.map.delete(key), this.ttlMs);
    }
    this.map.set(key, entry);
  }

  get(key: K): V | undefined {
    return this.map.get(key)?.value;
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      this.map.delete(key);
      return true;
    }
    return false;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

// DCR client registrations (no TTL - persist for server lifetime)
export interface ClientRegistration {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  clientName?: string;
}

export const clientRegistrations = new TtlMap<string, ClientRegistration>();

// Authorization request state mapping (10 min TTL)
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  originalState: string;
}

export const authorizationRequests = new TtlMap<string, AuthorizationRequest>(10 * 60 * 1000);

// Pending code exchanges - maps Entra auth code for token exchange (10 min TTL)
export interface PendingCodeExchange {}

export const pendingCodeExchanges = new TtlMap<string, PendingCodeExchange>(10 * 60 * 1000);

// Crypto helpers
export function generateClientId(): string {
  return randomBytes(16).toString('hex');
}

export function generateClientSecret(): string {
  return randomBytes(32).toString('hex');
}

export function generateState(): string {
  return randomBytes(16).toString('hex');
}
