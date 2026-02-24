const requiredEnv = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export interface TenantConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
}

let tenantConfig: TenantConfig | undefined;

export function loadConfig(): void {
  const tenantId = requiredEnv('ENTRA_TENANT_ID');
  const authority = process.env['ENTRA_AUTHORITY'] || `https://login.microsoftonline.com/${tenantId}`;
  tenantConfig = {
    tenantId,
    clientId: requiredEnv('ENTRA_CLIENT_ID'),
    clientSecret: requiredEnv('ENTRA_CLIENT_SECRET'),
    authorizeUrl: `${authority}/oauth2/v2.0/authorize`,
    tokenUrl: `${authority}/oauth2/v2.0/token`,
  };
}

export function getTenantConfig(): TenantConfig | undefined {
  return tenantConfig;
}

export function getProxyBaseUrl(): string {
  return requiredEnv('PROXY_BASE_URL');
}

export function getPort(): number {
  return parseInt(process.env['PORT'] || '3000', 10);
}
