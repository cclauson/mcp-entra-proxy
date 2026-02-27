import { Router } from 'express';
import { getClient, getCodeExchange, deleteCodeExchange } from './store.js';
import { getTenantConfig, getProxyBaseUrl } from './config.js';

const router = Router();

router.post('/oauth/token', async (req, res) => {
  const { grant_type, code, client_id, client_secret, code_verifier } = req.body;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  if (!client_id || !client_secret || !code) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters: client_id, client_secret, code',
    });
    return;
  }

  // Validate DCR client credentials
  const client = await getClient(client_id);
  if (!client || client.clientSecret !== client_secret) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  // Look up tenant config from the code → resource mapping
  const hasExchange = await getCodeExchange(code);
  if (!hasExchange) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Unknown or expired authorization code',
    });
    return;
  }

  // Single-use: delete the pending exchange
  await deleteCodeExchange(code);

  const tenantConfig = getTenantConfig();
  if (!tenantConfig) {
    res.status(500).json({ error: 'server_error', error_description: 'Tenant configuration not found' });
    return;
  }

  // Forward to Entra's token endpoint with proxy's own client credentials
  const proxyCallbackUrl = `${getProxyBaseUrl()}/callback`;
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: proxyCallbackUrl,
    client_id: tenantConfig.clientId,
    client_secret: tenantConfig.clientSecret,
  });

  if (code_verifier) {
    params.set('code_verifier', code_verifier);
  }

  const entraResponse = await fetch(tenantConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const entraBody = await entraResponse.json();
  res.status(entraResponse.status).json(entraBody);
});

export default router;
