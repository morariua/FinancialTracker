import { create } from 'zustand';
import { api, tokenStore } from '../api/client';
import type { Settings, User } from '../api/types';

interface AuthState {
  user: User | null;
  settings: Settings | null;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  setSettings: (s: Settings) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  settings: null,
  loading: false,
  loaded: false,

  async load() {
    if (!tokenStore.access) {
      set({ loaded: true });
      return;
    }
    set({ loading: true });
    try {
      const r = await api.get('/auth/me');
      set({ user: r.data.user, settings: r.data.settings, loaded: true, loading: false });
    } catch {
      tokenStore.clear();
      set({ user: null, settings: null, loaded: true, loading: false });
    }
  },

  async login(email, password) {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.data.access, r.data.refresh);
    await get().load();
  },

  async register(email, password, name) {
    const r = await api.post('/auth/register', { email, password, name });
    tokenStore.set(r.data.access, r.data.refresh);
    await get().load();
  },

  async logout() {
    try {
      await api.post('/auth/logout', { refresh: tokenStore.refresh });
    } catch { /* ignore */ }
    tokenStore.clear();
    set({ user: null, settings: null });
  },

  setSettings(s) {
    set({ settings: s });
  },
}));
