// Trevyx — Main App component with routing
import React, { useState, useEffect } from 'react';
import { api } from './api';
import { BoardPage } from './pages/BoardPage';
import './styles.css';

// @Page(/)
// @Auth(roles: ["public"])
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('trevyx_token'));
  const [user, setUser] = useState<any>(null);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [boards, setBoards] = useState<any[]>([]);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      api.auth.me().then(data => {
        if (data && typeof data === 'object' && data.id && data.name) {
          setUser(data);
        } else {
          throw new Error('invalid user data');
        }
      }).catch(() => {
        localStorage.removeItem('trevyx_token');
        setToken(null);
      });
    }
  }, [token]);

  useEffect(() => {
    if (user) loadBoards();
  }, [user]);

  function loadBoards() {
    api.boards.list().then(data => {
      if (Array.isArray(data)) {
        setBoards(data);
      } else {
        console.error('boards API returned non-array:', data);
        setBoards([]);
      }
    }).catch(console.error);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = isRegister
        ? await api.auth.register(registerEmail, registerName, registerPassword)
        : await api.auth.login(loginEmail, loginPassword);
      localStorage.setItem('trevyx_token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateBoard() {
    if (!newBoardTitle.trim()) return;
    const board = await api.boards.create(newBoardTitle);
    setBoards([board, ...boards]);
    setNewBoardTitle('');
    setShowNewBoard(false);
    setCurrentBoardId(board.id);
  }

  function handleLogout() {
    localStorage.removeItem('trevyx_token');
    setToken(null);
    setUser(null);
    setCurrentBoardId(null);
  }

  if (!token || !user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>📋 Trevyx</h1>
          <p className="subtitle">Kanban board powered by vyx</p>
          <form onSubmit={handleLogin}>
            {isRegister && (
              <input
                placeholder="Name"
                value={registerName}
                onChange={e => setRegisterName(e.target.value)}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={isRegister ? registerEmail : loginEmail}
              onChange={e => isRegister ? setRegisterEmail(e.target.value) : setLoginEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={isRegister ? registerPassword : loginPassword}
              onChange={e => isRegister ? setRegisterPassword(e.target.value) : setLoginPassword(e.target.value)}
              required
            />
            {error && <p className="error">{error}</p>}
            <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
          </form>
          <p className="switch" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
          </p>
        </div>
      </div>
    );
  }

  if (currentBoardId) {
    return <BoardPage boardId={currentBoardId} onBack={() => setCurrentBoardId(null)} user={user} />;
  }

  return (
    <div className="home-page">
      <header>
        <h1>📋 Trevyx</h1>
        <div className="header-right">
          <span>{user.name}</span>
          <button className="btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main>
        <div className="boards-header">
          <h2>My Boards</h2>
          <button onClick={() => setShowNewBoard(true)}>+ New Board</button>
        </div>
        {showNewBoard && (
          <div className="new-board-form">
            <input
              placeholder="Board title"
              value={newBoardTitle}
              onChange={e => setNewBoardTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateBoard()}
              autoFocus
            />
            <button onClick={handleCreateBoard}>Create</button>
            <button className="btn-secondary" onClick={() => setShowNewBoard(false)}>Cancel</button>
          </div>
        )}
        <div className="boards-grid">
          {Array.isArray(boards) && boards.map(board => (
            <div
              key={board.id}
              className="board-card"
              style={{ borderTopColor: board.color }}
              onClick={() => setCurrentBoardId(board.id)}
            >
              <h3>{board.title}</h3>
              {board.description && <p>{board.description}</p>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
