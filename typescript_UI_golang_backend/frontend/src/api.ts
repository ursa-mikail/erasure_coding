import {
  GenerateResponse,
  DestroyResponse,
  RecoverResponse,
  DatabaseState,
  StatusResponse,
} from './types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  status: () => request<StatusResponse>('/status'),
  generate: () => request<GenerateResponse>('/generate', { method: 'POST' }),
  getShards: () => request<DatabaseState>('/shards'),
  destroy: (shardIds: number[], force = false) =>
    request<DestroyResponse>('/destroy', {
      method: 'POST',
      body: JSON.stringify({ shard_ids: shardIds, force }),
    }),
  recover: () => request<RecoverResponse>('/recover', { method: 'POST' }),
};
