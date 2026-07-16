// Trevyx — API client
const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('trevyx_token');
}

async function request(method: string, path: string, body?: any): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return text;
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  auth: {
    register: (email: string, name: string, password: string) =>
      request('POST', '/auth/register', { email, name, password }),
    login: (email: string, password: string) =>
      request('POST', '/auth/login', { email, password }),
    me: () => request('GET', '/auth/me'),
  },
  boards: {
    list: () => request('GET', '/boards'),
    get: (id: string) => request('GET', `/boards/${id}`),
    create: (title: string, description?: string, color?: string) =>
      request('POST', '/boards', { title, description, color }),
    update: (id: string, data: any) => request('PUT', `/boards/${id}`, data),
    delete: (id: string) => request('DELETE', `/boards/${id}`),
  },
  lists: {
    create: (boardId: string, title: string) =>
      request('POST', `/boards/${boardId}/lists`, { title }),
    update: (id: string, title: string) => request('PUT', `/lists/${id}`, { title }),
    delete: (id: string) => request('DELETE', `/lists/${id}`),
    reorder: (boardId: string, listIds: string[]) =>
      request('POST', `/boards/${boardId}/lists/reorder`, { listIds }),
  },
  cards: {
    create: (listId: string, title: string, description?: string) =>
      request('POST', `/lists/${listId}/cards`, { title, description }),
    get: (id: string) => request('GET', `/cards/${id}`),
    update: (id: string, data: any) => request('PUT', `/cards/${id}`, data),
    delete: (id: string) => request('DELETE', `/cards/${id}`),
    move: (cardId: string, listId: string, position: number) =>
      request('POST', `/cards/${cardId}/move`, { listId, position }),
    reorder: (listId: string, cardIds: string[]) =>
      request('POST', `/lists/${listId}/cards/reorder`, { cardIds }),
    createComment: (cardId: string, content: string) =>
      request('POST', `/cards/${cardId}/comments`, { content }),
  },
  search: (q: string) => request('GET', `/search?q=${encodeURIComponent(q)}`),
};
