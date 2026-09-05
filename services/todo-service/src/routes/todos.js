import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth); // every route below requires a valid JWT

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = await pool.query(
    'INSERT INTO todos (user_id, title) VALUES ($1, $2) RETURNING *',
    [req.userId, title]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, is_done } = req.body;
  const result = await pool.query(
    'UPDATE todos SET title = COALESCE($1, title), is_done = COALESCE($2, is_done) WHERE id = $3 AND user_id = $4 RETURNING *',
    [title, is_done, id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

export default router;
