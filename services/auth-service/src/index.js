import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.use('/', authRoutes);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
