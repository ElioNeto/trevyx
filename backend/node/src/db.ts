// Trevyx — Database initialization and access layer
// Uses better-sqlite3 for local SQLite storage

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.TREVYX_DB_PATH || path.join(__dirname, '..', 'trevyx.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#2563eb',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      priority TEXT DEFAULT 'medium',
      labels TEXT DEFAULT '[]',
      assignee_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
    CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id);
    CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(list_id);
    CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id);
  `);
}
