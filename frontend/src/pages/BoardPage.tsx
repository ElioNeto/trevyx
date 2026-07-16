// Trevyx — Board page with Kanban board (drag & drop) + card detail modal
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

interface Props {
  boardId: string;
  onBack: () => void;
  user: any;
}

// @Page(/board/:id)
// @Auth(roles: ["user"])
export function BoardPage({ boardId, onBack, user }: Props) {
  const [board, setBoard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newListTitle, setNewListTitle] = useState('');
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({});
  const [dragCard, setDragCard] = useState<any>(null);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [cardComments, setCardComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [cardForm, setCardForm] = useState({ title: '', description: '', priority: 'medium', due_date: '', labels: '' });
  const [boardDesc, setBoardDesc] = useState('');
  const [editingBoard, setEditingBoard] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.boards.get(boardId);
      setBoard(data);
      setBoardDesc(data.board.description || '');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  async function handleAddList() {
    if (!newListTitle.trim()) return;
    await api.lists.create(boardId, newListTitle);
    setNewListTitle('');
    loadBoard();
  }

  async function handleAddCard(listId: string) {
    const title = newCardTitles[listId];
    if (!title?.trim()) return;
    await api.cards.create(listId, title);
    setNewCardTitles({ ...newCardTitles, [listId]: '' });
    loadBoard();
  }

  async function handleDeleteList(listId: string) {
    if (!confirm('Delete this list and all its cards?')) return;
    await api.lists.delete(listId);
    loadBoard();
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm('Delete this card?')) return;
    await api.cards.delete(cardId);
    if (selectedCard?.id === cardId) setSelectedCard(null);
    loadBoard();
  }

  async function openCard(card: any) {
    try {
      const data = await api.cards.get(card.id);
      setSelectedCard(data.card);
      setCardComments(data.comments || []);
      setCardForm({
        title: data.card.title || '',
        description: data.card.description || '',
        priority: data.card.priority || 'medium',
        due_date: data.card.due_date || '',
        labels: data.card.labels ? JSON.parse(data.card.labels).join(', ') : '',
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function saveCard() {
    if (!selectedCard) return;
    try {
      const labels = cardForm.labels ? cardForm.labels.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      await api.cards.update(selectedCard.id, {
        title: cardForm.title || selectedCard.title,
        description: cardForm.description,
        priority: cardForm.priority,
        due_date: cardForm.due_date || null,
        labels: labels,
      });
      setSelectedCard(null);
      loadBoard();
    } catch (err) {
      console.error('Failed to save card:', err);
      alert('Error saving card: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function addComment() {
    if (!selectedCard || !newComment.trim()) return;
    await api.cards.createComment(selectedCard.id, newComment);
    setNewComment('');
    const data = await api.cards.get(selectedCard.id);
    setCardComments(data.comments || []);
  }

  async function updateBoardDesc() {
    await api.boards.update(boardId, { description: boardDesc });
    setEditingBoard(false);
  }

  // ─── Drag handlers ──────────────────────────────────────────────────

  function handleDragStart(card: any) { setDragCard(card); }

  async function handleDrop(listId: string) {
    if (!dragCard) return;
    try {
      await api.cards.move(dragCard.id, listId, 0);
      loadBoard();
    } catch (err) { console.error(err); }
    setDragCard(null);
  }

  function parseLabels(labelsStr: string): string[] {
    try { return JSON.parse(labelsStr); } catch { return []; }
  }

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) return <div className="loading">Loading board...</div>;
  if (!board) return <div className="loading">Board not found.</div>;

  return (
    <div className="board-page">
      <header>
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        {editingBoard ? (
          <div className="inline-edit">
            <input value={boardDesc} onChange={e => setBoardDesc(e.target.value)} />
            <button onClick={updateBoardDesc}>Save</button>
            <button className="btn-secondary" onClick={() => setEditingBoard(false)}>Cancel</button>
          </div>
        ) : (
          <h1 style={{ color: board.board.color }} onClick={() => setEditingBoard(true)}>
            {board.board.title}
          </h1>
        )}
        <span>{user.name}</span>
      </header>

      <div className="board">
        {board.lists.map((list: any) => (
          <div key={list.id} className="kanban-list"
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(list.id)}
          >
            <div className="list-header">
              <h3>{list.title}</h3>
              <button className="btn-icon" onClick={() => handleDeleteList(list.id)}>×</button>
            </div>
            <div className="cards-container">
              {list.cards.map((card: any) => (
                <div key={card.id} className="kanban-card" draggable
                  onDragStart={() => handleDragStart(card)}
                  onClick={() => openCard(card)}
                >
                  <div className="card-labels">
                    {parseLabels(card.labels).map((label, i) => (
                      <span key={i} className="label-badge" style={{ background: labelColor(label) }}>{label}</span>
                    ))}
                  </div>
                  <div className="card-title">{card.title}</div>
                  {card.description && <div className="card-desc">{card.description}</div>}
                  <div className="card-meta">
                    <span className={`priority-${card.priority}`}>{priorityIcon(card.priority)} {card.priority}</span>
                    {card.comments_count > 0 && <span>💬 {card.comments_count}</span>}
                    {card.due_date && <span>📅 {formatDate(card.due_date)}</span>}
                    {card.assignee_name && <span>👤 {card.assignee_name}</span>}
                  </div>
                  <button className="btn-icon delete" onClick={e => { e.stopPropagation(); handleDeleteCard(card.id); }}>×</button>
                </div>
              ))}
            </div>
            <div className="add-card-form">
              <input placeholder="+ Add card" value={newCardTitles[list.id] || ''}
                onChange={e => setNewCardTitles({ ...newCardTitles, [list.id]: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleAddCard(list.id)} />
            </div>
          </div>
        ))}
        <div className="kanban-list add-list">
          <div className="list-header">
            <input placeholder="+ Add list" value={newListTitle}
              onChange={e => setNewListTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddList()} />
          </div>
        </div>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="modal-overlay" onClick={() => setSelectedCard(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <input className="modal-title-input" value={cardForm.title}
                onChange={e => setCardForm({ ...cardForm, title: e.target.value })} />
              <button className="btn-icon" onClick={() => setSelectedCard(null)}>×</button>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <label>Description</label>
                <textarea value={cardForm.description}
                  onChange={e => setCardForm({ ...cardForm, description: e.target.value })}
                  placeholder="Add a description..." rows={4} />
              </div>

              <div className="modal-row">
                <div className="modal-field">
                  <label>Priority</label>
                  <select value={cardForm.priority}
                    onChange={e => setCardForm({ ...cardForm, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="modal-field">
                  <label>Due Date</label>
                  <input type="date" value={cardForm.due_date}
                    onChange={e => setCardForm({ ...cardForm, due_date: e.target.value })} />
                </div>
              </div>

              <div className="modal-field">
                <label>Labels (comma separated)</label>
                <input value={cardForm.labels}
                  onChange={e => setCardForm({ ...cardForm, labels: e.target.value })}
                  placeholder="bug, feature, urgent" />
              </div>

              {/* Comments */}
              <div className="modal-field">
                <label>Comments ({cardComments.length})</label>
                <div className="comments-list">
                  {cardComments.map((c: any, i: number) => (
                    <div key={c.id || i} className="comment">
                      <strong>{c.user_name || 'User'}</strong>
                      <span className="comment-time">{formatDate(c.created_at)}</span>
                      <p>{c.content}</p>
                    </div>
                  ))}
                  {cardComments.length === 0 && <p className="empty">No comments yet</p>}
                </div>
                <div className="add-comment">
                  <input placeholder="Write a comment..." value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addComment()} />
                  <button onClick={addComment} disabled={!newComment.trim()}>Send</button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedCard(null)}>Cancel</button>
              <button onClick={saveCard}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelColor(label: string): string {
  const colors: Record<string, string> = {
    'bug': '#e74c3c', 'feature': '#2ecc71', 'urgent': '#e67e22',
    'enhancement': '#3498db', 'question': '#9b59b6', 'wontfix': '#95a5a6',
    'documentation': '#1abc9c', 'design': '#f39c12',
  };
  return colors[label.toLowerCase()] || '#6366f1';
}

function priorityIcon(p: string): string {
  return p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢';
}

function formatDate(d: string): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
}
