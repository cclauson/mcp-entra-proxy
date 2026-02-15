import { Router } from 'express';
import { getTenantConfig, getProxyBaseUrl } from './config.js';
import {
  clientRegistrations,
  authorizationRequests,
  pendingCodeExchanges,
  generateState,
} from './store.js';

const router = Router();

// MCP client redirects user here; proxy redirects to Entra
router.get('/authorize', (req, res) => {
  const {
    client_id,
    redirect_uri,
    state,
    resource,
    code_challenge,
    code_challenge_method,
  } = req.query as Record<string, string>;

  if (!client_id || !redirect_uri || !state || !resource) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters: client_id, redirect_uri, state, resource',
    });
    return;
  }

  const client = clientRegistrations.get(client_id);
  if (!client) {
    res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
    return;
  }

  if (!client.redirectUris.includes(redirect_uri)) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'redirect_uri not registered for this client',
    });
    return;
  }

  const tenantConfig = getTenantConfig(resource);
  if (!tenantConfig) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Unknown resource' });
    return;
  }

  const proxyState = generateState();
  authorizationRequests.set(proxyState, {
    clientId: client_id,
    redirectUri: redirect_uri,
    originalState: state,
    resource,
  });

  const proxyCallbackUrl = `${getProxyBaseUrl()}/callback`;
  const params = new URLSearchParams({
    client_id: tenantConfig.clientId,
    redirect_uri: proxyCallbackUrl,
    response_type: 'code',
    state: proxyState,
    scope: 'openid profile email',
  });

  if (code_challenge) {
    params.set('code_challenge', code_challenge);
    params.set('code_challenge_method', code_challenge_method || 'S256');
  }

  res.redirect(`${tenantConfig.authorizeUrl}?${params.toString()}`);
});

// Entra redirects here; proxy redirects to MCP client with Entra code
router.get('/callback', (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (!state) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Missing state parameter' });
    return;
  }

  const authRequest = authorizationRequests.get(state);
  if (!authRequest) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Unknown or expired state' });
    return;
  }

  // Single-use: delete the authorization request
  authorizationRequests.delete(state);

  if (error) {
    const params = new URLSearchParams({
      error,
      ...(error_description && { error_description }),
      state: authRequest.originalState,
    });
    res.redirect(`${authRequest.redirectUri}?${params.toString()}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Missing code parameter' });
    return;
  }

  // Store code → resource mapping for the token exchange
  pendingCodeExchanges.set(code, { resource: authRequest.resource });

  const params = new URLSearchParams({
    code,
    state: authRequest.originalState,
  });

  res.redirect(`${authRequest.redirectUri}?${params.toString()}`);
});

export default router;
