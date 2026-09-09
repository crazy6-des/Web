export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://sphere-api.binancecompany274.workers.dev').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(typeof data === 'object' && data?.error ? data.error : 'Request failed', response.status);
  return data as T;
}

export const api = {
  session: () => request<{ user: User | null }>('/auth/session'),
  signup: (input: { username: string; email: string; password: string }) => request<{ user: User }>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email?: string; username?: string; password: string }) => request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  posts: (limit = 20, offset = 0) => request<{ posts: Post[] }>(`/posts?limit=${limit}&offset=${offset}`),
  like: (postId: string) => request<{ liked: boolean }>(`/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' }),
  save: (postId: string) => request<{ saved: boolean }>(`/posts/${encodeURIComponent(postId)}/save`, { method: 'POST' }),
  comment: (postId: string, content: string, parentId?: string) => request<{ comment_id: string }>(`/posts/${encodeURIComponent(postId)}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId }) }),
  follow: (userId: string) => request<{ following: boolean }>('/follows', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  notifications: () => request<{ notifications: unknown[] }>('/notifications'),
  search: (q: string) => request<{ users: User[]; posts: Post[] }>(`/search?q=${encodeURIComponent(q)}`),
  uploadImage: (file: File) => { const form = new FormData(); form.append('file', file); return request<{ key: string }>('/upload/image', { method: 'POST', body: form }); },
  createPost: (input: { caption: string; music?: Music; imageKey?: string }) => request<{ post_id: string }>('/posts', { method: 'POST', body: JSON.stringify(input) }),
  wallet: () => request<{ wallet: Record<string, unknown> | null; transactions: unknown[] }>('/wallet'),
  earn: () => request<{ offers: unknown[] }>('/earn/offers'),
};

export type User = { id: string; username: string; email: string; avatar_url?: string | null; bio?: string | null; status?: string | null };
export type Music = { provider?: string; id?: string; title?: string; artist?: string; album?: string; artwork_url?: string; duration_ms?: number; external_url?: string };
export type Post = Record<string, any> & { id?: string; post_id?: string; caption?: string; author?: User; media?: Record<string, any> | null; like_count?: number };
