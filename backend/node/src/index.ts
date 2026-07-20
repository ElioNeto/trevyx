// Trevyx — Main worker entry point
// @vyx/worker routes registered before start()

import { worker, json, error, text } from '@vyx/worker';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import * as models from './models.js';

const JWT_SECRET = process.env.JWT_SECRET || 'trevyx-dev-secret-at-least-32-bytes-long!!';

// ─── Auth ──────────────────────────────────────────────────────────────

// @Route(POST /api/auth/register)
// @Auth(roles: ["public"])
// @Validate(JsonSchema: "register")
worker.post('/api/auth/register', (req) => {
  const { email, name, password } = req.body as any;
  if (!email || !name || !password) return error('email, name and password required', 400);

  const existing = models.findUserByEmail(email);
  if (existing) return error('email already registered', 409);

  const hash = bcrypt.hashSync(password, 10);
  const user = models.createUser(email, name, hash);

  const token = jwt.sign({ user_id: user.id, roles: ['user'] }, JWT_SECRET, { expiresIn: '7d' });
  return json({ token, user: { id: user.id, email: user.email, name: user.name } }, 201);
});

// @Route(POST /api/auth/login)
// @Auth(roles: ["public"])
// @Validate(JsonSchema: "login")
worker.post('/api/auth/login', (req) => {
  const { email, password } = req.body as any;
  if (!email || !password) return error('email and password required', 400);

  const user = models.findUserByEmail(email);
  if (!user) return error('invalid credentials', 401);

  if (!bcrypt.compareSync(password, user.password_hash)) return error('invalid credentials', 401);

  const token = jwt.sign({ user_id: user.id, roles: ['user'] }, JWT_SECRET, { expiresIn: '7d' });
  return json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// @Route(GET /api/auth/me)
// @Auth(roles: ["user"])
worker.get('/api/auth/me', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const user = models.findUserById(req.claims.user_id);
  if (!user) return error('user not found', 404);
  return json({ id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url });
});

// ─── Boards ────────────────────────────────────────────────────────────

// @Route(GET /api/boards)
// @Auth(roles: ["user"])
worker.get('/api/boards', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const boards = models.listBoards(req.claims.user_id);
  return json(boards);
});

// @Route(POST /api/boards)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "create_board")
worker.post('/api/boards', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const { title, description, color } = req.body as any;
  if (!title) return error('title is required', 400);
  const board = models.createBoard(req.claims.user_id, title, description, color);
  return json(board, 201);
});

// @Route(GET /api/boards/:id)
// @Auth(roles: ["user"])
worker.get('/api/boards/:id', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const boardWithLists = models.getBoardWithLists(req.params.id);
  if (!boardWithLists) return error('board not found', 404);
  if (boardWithLists.board.user_id !== req.claims.user_id) return error('forbidden', 403);
  return json(boardWithLists);
});

// @Route(PUT /api/boards/:id)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "update_board")
worker.put('/api/boards/:id', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const board = models.getBoard(req.params.id);
  if (!board) return error('board not found', 404);
  if (board.user_id !== req.claims.user_id) return error('forbidden', 403);
  const updated = models.updateBoard(req.params.id, req.body as any);
  return json(updated);
});

// @Route(DELETE /api/boards/:id)
// @Auth(roles: ["user"])
worker.delete('/api/boards/:id', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const board = models.getBoard(req.params.id);
  if (!board) return error('board not found', 404);
  if (board.user_id !== req.claims.user_id) return error('forbidden', 403);
  models.deleteBoard(req.params.id);
  return json({ deleted: true });
});

// ─── Lists ─────────────────────────────────────────────────────────────

// @Route(POST /api/boards/:boardId/lists)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "create_list")
worker.post('/api/boards/:boardId/lists', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const board = models.getBoard(req.params.boardId);
  if (!board) return error('board not found', 404);
  if (board.user_id !== req.claims.user_id) return error('forbidden', 403);
  const { title } = req.body as any;
  if (!title) return error('title is required', 400);
  const list = models.createList(req.params.boardId, title);
  return json(list, 201);
});

// @Route(PUT /api/lists/:id)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "update_list")
worker.put('/api/lists/:id', (req) => {
  const { title } = req.body as any;
  if (!title) return error('title is required', 400);
  const updated = models.updateList(req.params.id, title);
  if (!updated) return error('list not found', 404);
  return json(updated);
});

// @Route(DELETE /api/lists/:id)
// @Auth(roles: ["user"])
worker.delete('/api/lists/:id', (req) => {
  models.deleteList(req.params.id);
  return json({ deleted: true });
});

// @Route(POST /api/boards/:boardId/lists/reorder)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "reorder_lists")
worker.post('/api/boards/:boardId/lists/reorder', (req) => {
  const { listIds } = req.body as any;
  if (!Array.isArray(listIds)) return error('listIds array required', 400);
  models.reorderLists(req.params.boardId, listIds);
  return json({ success: true });
});

// ─── Cards ─────────────────────────────────────────────────────────────

// @Route(POST /api/lists/:listId/cards)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "create_card")
worker.post('/api/lists/:listId/cards', (req) => {
  const { title, description } = req.body as any;
  if (!title) return error('title is required', 400);
  const card = models.createCard(req.params.listId, title, description);
  return json(card, 201);
});

// @Route(GET /api/cards/:id)
// @Auth(roles: ["user"])
worker.get('/api/cards/:id', (req) => {
  const card = models.getCard(req.params.id);
  if (!card) return error('card not found', 404);
  const comments = models.getComments(req.params.id);
  return json({ card, comments });
});

// @Route(PUT /api/cards/:id)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "update_card")
worker.put('/api/cards/:id', (req) => {
  const updated = models.updateCard(req.params.id, req.body as any);
  if (!updated) return error('card not found', 404);
  return json(updated);
});

// @Route(DELETE /api/cards/:id)
// @Auth(roles: ["user"])
worker.delete('/api/cards/:id', (req) => {
  models.deleteCard(req.params.id);
  return json({ deleted: true });
});

// @Route(POST /api/cards/:cardId/move)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "move_card")
worker.post('/api/cards/:cardId/move', (req) => {
  const { listId, position } = req.body as any;
  if (!listId || position === undefined) return error('listId and position required', 400);
  const card = models.moveCard(req.params.cardId, listId, position);
  if (!card) return error('card not found', 404);
  return json(card);
});

// @Route(POST /api/lists/:listId/cards/reorder)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "reorder_cards")
worker.post('/api/lists/:listId/cards/reorder', (req) => {
  const { cardIds } = req.body as any;
  if (!Array.isArray(cardIds)) return error('cardIds array required', 400);
  models.reorderCards(req.params.listId, cardIds);
  return json({ success: true });
});

// ─── Comments ──────────────────────────────────────────────────────────

// @Route(POST /api/cards/:cardId/comments)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "create_comment")
worker.post('/api/cards/:cardId/comments', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const { content } = req.body as any;
  if (!content) return error('content is required', 400);
  const comment = models.addComment(req.params.cardId, req.claims.user_id, content);
  return json(comment, 201);
});

// @Route(GET /api/cards/:cardId/comments)
// @Auth(roles: ["user"])
worker.get('/api/cards/:cardId/comments', (req) => {
  const comments = models.getComments(req.params.cardId);
  return json(comments);
});

// ─── Search ────────────────────────────────────────────────────────────

// @Route(GET /api/search?q=...)
// @Auth(roles: ["user"])
worker.get('/api/search', (req) => {
  if (!req.claims) return error('unauthorized', 401);
  const query = req.query.q;
  if (!query) return json([]);
  const results = models.searchCards(req.claims.user_id, query);
  return json(results);
});

// ─── Start worker ─────────────────────────────────────────────────────

worker.start({
  workerId: 'node:node',
  capabilities: [
    { path: '/api/auth/register', method: 'POST' },
    { path: '/api/auth/login', method: 'POST' },
    { path: '/api/auth/me', method: 'GET' },
    { path: '/api/boards', method: 'GET' },
    { path: '/api/boards', method: 'POST' },
    { path: '/api/boards/:id', method: 'GET' },
    { path: '/api/boards/:id', method: 'PUT' },
    { path: '/api/boards/:id', method: 'DELETE' },
    { path: '/api/boards/:boardId/lists', method: 'POST' },
    { path: '/api/boards/:boardId/lists/reorder', method: 'POST' },
    { path: '/api/lists/:id', method: 'PUT' },
    { path: '/api/lists/:id', method: 'DELETE' },
    { path: '/api/lists/:listId/cards', method: 'POST' },
    { path: '/api/lists/:listId/cards/reorder', method: 'POST' },
    { path: '/api/cards/:id', method: 'GET' },
    { path: '/api/cards/:id', method: 'PUT' },
    { path: '/api/cards/:id', method: 'DELETE' },
    { path: '/api/cards/:cardId/move', method: 'POST' },
    { path: '/api/cards/:cardId/comments', method: 'GET' },
    { path: '/api/cards/:cardId/comments', method: 'POST' },
    { path: '/api/search', method: 'GET' },
  ],
});
