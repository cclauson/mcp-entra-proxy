import express from 'express';
import { loadConfig, getPort } from './config.js';
import metadataRouter from './metadata.js';
import dcrRouter from './dcr.js';
import authorizeRouter from './authorize.js';
import tokenRouter from './token.js';

loadConfig();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use(metadataRouter);
app.use(dcrRouter);
app.use(authorizeRouter);
app.use(tokenRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
});

const port = getPort();
app.listen(port, () => {
  console.log(`MCP Entra Proxy listening on port ${port}`);
});
