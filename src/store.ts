import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const prisma = new PrismaClient();

let cleanupTimer: ReturnType<typeof setInterval> | undefined;

// --- Client registrations (persistent, no TTL) ---

export interface ClientRegistrationData {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  clientName?: string;
}

export async function getClient(clientId: string): Promise<ClientRegistrationData | null> {
  const row = await prisma.clientRegistration.findUnique({ where: { clientId } });
  if (!row) return null;
  return {
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    redirectUris: row.redirectUris,
    clientName: row.clientName ?? undefined,
  };
}

export async function setClient(reg: ClientRegistrationData): Promise<void> {
  await prisma.clientRegistration.upsert({
    where: { clientId: reg.clientId },
    update: {
      clientSecret: reg.clientSecret,
      redirectUris: reg.redirectUris,
      clientName: reg.clientName ?? null,
    },
    create: {
      clientId: reg.clientId,
      clientSecret: reg.clientSecret,
      redirectUris: reg.redirectUris,
      clientName: reg.clientName ?? null,
    },
  });
}

// --- Authorization requests (10 min TTL) ---

export interface AuthorizationRequestData {
  clientId: string;
  redirectUri: string;
  originalState: string;
}

export async function getAuthRequest(proxyState: string): Promise<AuthorizationRequestData | null> {
  const row = await prisma.authorizationRequest.findFirst({
    where: { proxyState, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;
  return {
    clientId: row.clientId,
    redirectUri: row.redirectUri,
    originalState: row.originalState,
  };
}

export async function setAuthRequest(proxyState: string, req: AuthorizationRequestData): Promise<void> {
  await prisma.authorizationRequest.upsert({
    where: { proxyState },
    update: {
      clientId: req.clientId,
      redirectUri: req.redirectUri,
      originalState: req.originalState,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
    create: {
      proxyState,
      clientId: req.clientId,
      redirectUri: req.redirectUri,
      originalState: req.originalState,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
}

export async function deleteAuthRequest(proxyState: string): Promise<void> {
  await prisma.authorizationRequest.deleteMany({ where: { proxyState } });
}

// --- Pending code exchanges (10 min TTL) ---

export async function getCodeExchange(code: string): Promise<boolean> {
  const row = await prisma.pendingCodeExchange.findFirst({
    where: { code, expiresAt: { gt: new Date() } },
  });
  return row !== null;
}

export async function setCodeExchange(code: string): Promise<void> {
  await prisma.pendingCodeExchange.upsert({
    where: { code },
    update: { expiresAt: new Date(Date.now() + TTL_MS) },
    create: { code, expiresAt: new Date(Date.now() + TTL_MS) },
  });
}

export async function deleteCodeExchange(code: string): Promise<void> {
  await prisma.pendingCodeExchange.deleteMany({ where: { code } });
}

// --- Cleanup sweep ---

async function cleanupExpired(): Promise<void> {
  const now = new Date();
  const [authDeleted, codeDeleted] = await Promise.all([
    prisma.authorizationRequest.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.pendingCodeExchange.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  if (authDeleted.count > 0 || codeDeleted.count > 0) {
    console.log(`Cleanup: removed ${authDeleted.count} expired auth requests, ${codeDeleted.count} expired code exchanges`);
  }
}

export function startCleanupInterval(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupExpired().catch((err) => console.error('Cleanup error:', err));
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is running
  cleanupTimer.unref();
}

export function stopCleanupInterval(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
}

// --- Crypto helpers ---

export function generateClientId(): string {
  return randomBytes(16).toString('hex');
}

export function generateClientSecret(): string {
  return randomBytes(32).toString('hex');
}

export function generateState(): string {
  return randomBytes(16).toString('hex');
}
