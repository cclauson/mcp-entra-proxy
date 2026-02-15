import { Router } from 'express';
import { getProxyBaseUrl } from './config.js';

const router = Router();

router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  const base = getProxyBaseUrl();
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oidc/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  });
});

export default router;
