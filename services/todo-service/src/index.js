import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import todoRoutes from './routes/todos.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'todo-service' }));
app.use('/', todoRoutes);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`Todo service running on port ${PORT}`));
