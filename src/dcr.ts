import { Router } from 'express';
import {
  setClient,
  generateClientId,
  generateClientSecret,
} from './store.js';

const router = Router();

router.post('/oidc/register', async (req, res) => {
  const { redirect_uris, client_name } = req.body;

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'redirect_uris is required and must be a non-empty array',
    });
    return;
  }

  for (const uri of redirect_uris) {
    if (typeof uri !== 'string') {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'Each redirect_uri must be a string',
      });
      return;
    }
  }

  const clientId = generateClientId();
  const clientSecret = generateClientSecret();

  await setClient({
    clientId,
    clientSecret,
    redirectUris: redirect_uris,
    clientName: client_name,
  });

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris,
    client_name: client_name || undefined,
    token_endpoint_auth_method: 'client_secret_post',
  });
});

export default router;
