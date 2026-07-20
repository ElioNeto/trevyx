// Trevyx — Data access layer
import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  user_id: string;
  title: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  list_id: string;
  title: string;
  description: string;
  position: number;
  due_date: string | null;
  priority: string;
  labels: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardWithDetails extends Card {
  comments_count: number;
  assignee_name: string | null;
}

export interface BoardWithLists {
  board: Board;
  lists: Array<List & {
    cards: CardWithDetails[];
  }>;
}

// ─── Users ──────────────────────────────────────────────────────────────

export function createUser(email: string, name: string, passwordHash: string): User {
  const id = uuid();
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    'INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(id, email, name, passwordHash, now, now);
  return { id, email, name, password_hash: passwordHash, avatar_url: null, created_at: now, updated_at: now };
}

export function findUserByEmail(email: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

export function findUserById(id: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

// ─── Boards ─────────────────────────────────────────────────────────────

export function createBoard(userId: string, title: string, description: string = '', color: string = '#2563eb'): Board {
  const id = uuid();
  const now = new Date().toISOString();
  getDb().prepare(
    'INSERT INTO boards (id, user_id, title, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, title, description, color, now, now);
  return { id, user_id: userId, title, description, color, created_at: now, updated_at: now };
}

export function listBoards(userId: string): Board[] {
  return getDb().prepare('SELECT * FROM boards WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as Board[];
}

export function getBoard(id: string): Board | undefined {
  return getDb().prepare('SELECT * FROM boards WHERE id = ?').get(id) as Board | undefined;
}

export function updateBoard(id: string, data: { title?: string; description?: string; color?: string }): Board | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
  if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
  if (data.color !== undefined) { sets.push('color = ?'); params.push(data.color); }
  if (sets.length === 0) return getBoard(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE boards SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getBoard(id);
}

export function deleteBoard(id: string): void {
  getDb().prepare('DELETE FROM boards WHERE id = ?').run(id);
}

// ─── Lists ──────────────────────────────────────────────────────────────

export function createList(boardId: string, title: string): List {
  const id = uuid();
  const now = new Date().toISOString();
  const maxPos = getDb().prepare('SELECT COALESCE(MAX(position), -1) + 1 as pos FROM lists WHERE board_id = ?').get(boardId) as any;
  const position = maxPos?.pos ?? 0;
  getDb().prepare(
    'INSERT INTO lists (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, boardId, title, position, now, now);
  return { id, board_id: boardId, title, position, created_at: now, updated_at: now };
}

export function updateList(id: string, title: string): List | undefined {
  getDb().prepare("UPDATE lists SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
  return getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id) as List | undefined;
}

export function deleteList(id: string): void {
  getDb().prepare('DELETE FROM lists WHERE id = ?').run(id);
}

export function reorderLists(boardId: string, listIds: string[]): void {
  const stmt = getDb().prepare('UPDATE lists SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND board_id = ?');
  const txn = getDb().transaction((ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i], boardId);
    }
  });
  txn(listIds);
}

// ─── Cards ──────────────────────────────────────────────────────────────

export function createCard(listId: string, title: string, description: string = ''): Card {
  const id = uuid();
  const now = new Date().toISOString();
  const maxPos = getDb().prepare('SELECT COALESCE(MAX(position), -1) + 1 as pos FROM cards WHERE list_id = ?').get(listId) as any;
  const position = maxPos?.pos ?? 0;
  getDb().prepare(
    'INSERT INTO cards (id, list_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, listId, title, description, position, now, now);
  return { id, list_id: listId, title, description, position, due_date: null, priority: 'medium', labels: '[]', assignee_id: null, created_at: now, updated_at: now };
}

export function getCard(id: string): Card | undefined {
  return getDb().prepare('SELECT * FROM cards WHERE id = ?').get(id) as Card | undefined;
}

export function updateCard(id: string, data: Partial<Card>): Card | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  const allowed = ['title', 'description', 'position', 'list_id', 'due_date', 'priority', 'labels', 'assignee_id'];
  for (const key of allowed) {
    const val = (data as any)[key];
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      // Stringify arrays/objects for SQLite TEXT columns
      params.push(Array.isArray(val) ? JSON.stringify(val) : val);
    }
  }
  if (sets.length === 0) return getCard(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getCard(id);
}

export function deleteCard(id: string): void {
  getDb().prepare('DELETE FROM cards WHERE id = ?').run(id);
}

export function moveCard(cardId: string, targetListId: string, newPosition: number): Card | undefined {
  const now = new Date().toISOString();
  getDb().prepare(
    'UPDATE cards SET list_id = ?, position = ?, updated_at = ? WHERE id = ?'
  ).run(targetListId, newPosition, now, cardId);
  return getCard(cardId);
}

export function reorderCards(listId: string, cardIds: string[]): void {
  const stmt = getDb().prepare('UPDATE cards SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND list_id = ?');
  const txn = getDb().transaction((ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i], listId);
    }
  });
  txn(cardIds);
}

// ─── Board with full hierarchy ─────────────────────────────────────────

export function getBoardWithLists(boardId: string): BoardWithLists | null {
  const board = getBoard(boardId);
  if (!board) return null;

  const lists = getDb().prepare(
    'SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC'
  ).all(boardId) as List[];

  const listWithCards = lists.map(list => {
    const cards = getDb().prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comments_count,
        u.name as assignee_name
      FROM cards c
      LEFT JOIN users u ON c.assignee_id = u.id
      WHERE c.list_id = ?
      ORDER BY c.position ASC
    `).all(list.id) as CardWithDetails[];
    return { ...list, cards };
  });

  return { board, lists: listWithCards };
}

// ─── Search ─────────────────────────────────────────────────────────────

export function searchCards(userId: string, query: string): CardWithDetails[] {
  const like = `%${query}%`;
  return getDb().prepare(`
    SELECT DISTINCT c.*,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comments_count,
      u.name as assignee_name
    FROM cards c
    JOIN lists l ON c.list_id = l.id
    JOIN boards b ON l.board_id = b.id
    LEFT JOIN users u ON c.assignee_id = u.id
    WHERE b.user_id = ?
      AND (c.title LIKE ? OR c.description LIKE ?)
    ORDER BY c.updated_at DESC
    LIMIT 20
  `).all(userId, like, like) as CardWithDetails[];
}

// ─── Comments ───────────────────────────────────────────────────────────

export function addComment(cardId: string, userId: string, content: string) {
  const id = uuid();
  const now = new Date().toISOString();
  getDb().prepare(
    'INSERT INTO comments (id, card_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, cardId, userId, content, now);
  return { id, card_id: cardId, user_id: userId, content, created_at: now };
}

export function getComments(cardId: string) {
  return getDb().prepare(`
    SELECT cm.*, u.name as user_name, u.avatar_url
    FROM comments cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.card_id = ?
    ORDER BY cm.created_at ASC
  `).all(cardId);
}
