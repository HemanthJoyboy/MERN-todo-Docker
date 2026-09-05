import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();
const app = express();
app.use(cors());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Client only ever talks to the gateway. The gateway forwards
// /api/auth/*  -> auth-service (port 4001)
// /api/todos/* -> todo-service (port 4002)
app.use('/api/auth', createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '' }
}));

app.use('/api/todos', createProxyMiddleware({
  target: process.env.TODO_SERVICE_URL || 'http://localhost:4002',
  changeOrigin: true,
  pathRewrite: { '^/api/todos': '' }
}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
