import React, { useEffect, useState } from 'react';
import { todoApi } from '../api.js';

export default function TodoList({ onLogout }) {
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState('');

  const load = async () => setTodos(await todoApi.list());

  useEffect(() => { load(); }, []);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await todoApi.create(title);
    setTitle('');
    load();
  };

  const toggle = async (todo) => {
    await todoApi.update(todo.id, { is_done: !todo.is_done });
    load();
  };

  const remove = async (id) => {
    await todoApi.remove(id);
    load();
  };

  return (
    <div className="todo-box">
      <div className="header">
        <h2>My Todos</h2>
        <button onClick={onLogout}>Logout</button>
      </div>
      <form onSubmit={addTodo}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New todo..." />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((t) => (
          <li key={t.id} className={t.is_done ? 'done' : ''}>
            <span onClick={() => toggle(t)}>{t.title}</span>
            <button onClick={() => remove(t.id)}>x</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
