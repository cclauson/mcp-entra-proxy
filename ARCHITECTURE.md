# MCP Entra Proxy - Architecture

## Problem

MCP (Model Context Protocol) clients like Claude and ChatGPT use OAuth2 to authenticate with MCP servers. The MCP spec relies on two OAuth features that Entra ID does not support:

1. **Dynamic Client Registration (DCR)** - RFC 7591. MCP clients register themselves as OAuth clients on the fly. Entra ID has no DCR endpoint.

2. **Resource parameter** - RFC 8707. MCP clients send `resource=https://mcp-server-url/` in the authorization request to indicate which API they want to access. Entra ID v2 endpoints actively reject this parameter with error `AADSTS901002`.

These two gaps make it impossible for MCP clients to authenticate against Entra ID directly.

## Solution

An OAuth2 proxy authorization server that sits between MCP clients and Entra ID. From the MCP client's perspective, the proxy *is* the authorization server. Behind the scenes, the proxy delegates user authentication to Entra ID.

```
MCP Client (Claude, ChatGPT, etc.)
    │
    ▼
┌──────────────────────────┐
│   MCP Entra Proxy        │
│                          │
│  - DCR endpoint          │
│  - Authorize endpoint    │
│  - Token endpoint        │
│  - Callback endpoint     │
│  - Metadata endpoint     │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   Entra ID               │
│                          │
│  Pre-registered app      │
│  (single redirect URI    │
│   pointing to proxy)     │
└──────────────────────────┘
```

## OAuth Flow (Detailed)

The proxy stitches together two separate OAuth flows:

### Flow A: MCP Client ↔ Proxy

The MCP client treats the proxy as a standard OAuth2 authorization server.

### Flow B: Proxy ↔ Entra ID

The proxy acts as an OAuth2 client to Entra ID, using a pre-registered app registration with a single redirect URI pointing back to the proxy.

### Step-by-Step

```
1. MCP client discovers the proxy via the MCP server's
   /.well-known/oauth-protected-resource metadata.

2. MCP client calls proxy's DCR endpoint to register itself.
   Proxy stores client info (client_id, redirect_uri, etc.) locally
   and returns credentials. No Entra app registration is created.

3. MCP client redirects user to proxy's /authorize endpoint:
   GET /authorize?
     client_id=PROXY_CLIENT_ID
     redirect_uri=https://claude.ai/callback
     resource=https://mcp-server.example.com/
     state=ABC
     code_challenge=...

4. Proxy stores the MCP client's redirect_uri, state, and resource.
   Proxy looks up the Entra tenant config using the resource parameter.
   Proxy redirects user to Entra's /authorize endpoint:
   GET https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?
     client_id=ENTRA_APP_CLIENT_ID
     redirect_uri=https://proxy.example.com/callback
     state=XYZ  (proxy's own state, maps back to MCP client's request)
     code_challenge=...

   Note: resource parameter is stripped. Entra would reject it.

5. User logs in at Entra ID.

6. Entra redirects to proxy's callback:
   GET https://proxy.example.com/callback?
     code=ENTRA_CODE
     state=XYZ

7. Proxy receives ENTRA_CODE. Looks up original MCP client request via state.
   Generates PROXY_CODE mapped to ENTRA_CODE.
   Redirects to MCP client's original redirect_uri:
   GET https://claude.ai/callback?
     code=PROXY_CODE
     state=ABC

8. MCP client exchanges PROXY_CODE at proxy's /oauth/token endpoint.
   Proxy exchanges ENTRA_CODE at Entra's /oauth/token endpoint.
   Proxy returns the Entra-issued access token to the MCP client.
```

## API → Tenant Mapping

The `resource` parameter identifies which MCP server the client wants to access. The proxy uses this to look up the corresponding Entra tenant configuration:

```
resource (from MCP client) → API registration → Entra tenant config
```

### MVP: Hard-coded

```typescript
const apiRegistrations: Record<string, EntraTenantConfig> = {
  'https://nutrition-tracker.example.com/': {
    tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    clientId: 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy',
    clientSecret: '...',
  },
};
```

### Future: Database-backed

Users register with the service and configure a mapping from their MCP server URL to their Entra tenant. The proxy looks up the mapping at runtime.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /oidc/register` | DCR - accepts RFC 7591 client registration, stores locally |
| `GET /authorize` | Strips `resource`, maps to Entra tenant, redirects to Entra |
| `GET /callback` | Receives Entra auth code, issues proxy code, redirects to MCP client |
| `POST /oauth/token` | Exchanges proxy code → Entra code → returns token |
| `GET /.well-known/oauth-authorization-server` | OAuth2 metadata advertising proxy endpoints |

## Token Strategy

**Pass-through**: The proxy returns Entra-issued tokens directly to the MCP client. The MCP server validates tokens against Entra's JWKS. The proxy does not issue or re-sign tokens.

This means the MCP server's auth middleware points at Entra (not the proxy) for token validation. The proxy is only involved during the authorization flow, not during API calls.

## Security Considerations

- **DCR is open**: Anyone can register a client. This is acceptable because registrations are stored locally in the proxy, not in Entra. Rate limiting and TTLs mitigate abuse.
- **Single Entra app**: Only the proxy knows the Entra app's client secret. MCP clients never interact with Entra directly.
- **Redirect URI validation**: The proxy should validate redirect URIs from DCR registrations (e.g., require HTTPS, no localhost in production).
- **State parameter**: The proxy must use cryptographically random state values and validate them on callback to prevent CSRF.
- **PKCE**: The proxy should pass through PKCE parameters (code_challenge, code_verifier) to Entra for additional security.

## Future: Multi-Tenant SaaS

The architecture supports evolution into a multi-tenant service:

1. **Multi-tenant Entra app registration**: Register one app marked as "multi-tenant" in the proxy's own tenant. Customers grant admin consent (`/adminconsent`) in their tenant - no manual app registration needed.

2. **Self-service onboarding**: Web UI where customers register their MCP server URL and grant admin consent to their Entra tenant.

3. **Database-backed mappings**: Replace hard-coded config with a database lookup from `resource` → tenant config.

4. **Custom domains**: Customers could CNAME `auth.their-domain.com` to the proxy for white-labeling.

## Tech Stack (MVP)

- **Runtime**: Node.js / Express
- **Storage**: In-memory (MVP), PostgreSQL (future)
- **Deployment**: Azure Container Apps
- **IaC**: Bicep
- **CI/CD**: GitHub Actions
