import React, { useState } from 'react';
import Login from './components/Login.jsx';
import TodoList from './components/TodoList.jsx';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const handleAuth = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="app">
      <h1>MERN Todo (Postgres / Neon)</h1>
      {user ? <TodoList onLogout={handleLogout} /> : <Login onAuth={handleAuth} />}
    </div>
  );
}
