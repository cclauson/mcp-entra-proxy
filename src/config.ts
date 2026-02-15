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
let resourceUrl: string | undefined;

export function loadConfig(): void {
  const tenantId = requiredEnv('ENTRA_TENANT_ID');
  resourceUrl = requiredEnv('RESOURCE_URL');
  tenantConfig = {
    tenantId,
    clientId: requiredEnv('ENTRA_CLIENT_ID'),
    clientSecret: requiredEnv('ENTRA_CLIENT_SECRET'),
    authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  };
}

export function getTenantConfig(resource: string): TenantConfig | undefined {
  if (resource === resourceUrl) return tenantConfig;
  return undefined;
}

export function getProxyBaseUrl(): string {
  return requiredEnv('PROXY_BASE_URL');
}

export function getPort(): number {
  return parseInt(process.env['PORT'] || '3000', 10);
}
