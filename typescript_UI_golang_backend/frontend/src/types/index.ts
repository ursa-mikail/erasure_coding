export interface Shard {
  id: number;
  destroyed: boolean;
  sha256: string;
  size: number;
}

export interface DatabaseState {
  shards: Shard[];
  original_hash: string;
  status: 'idle' | 'healthy' | 'degraded' | 'unrecoverable' | 'recovered';
  created_at?: string;
}

export interface GenerateResponse {
  success: boolean;
  original_hash: string;
  shard_count: number;
  data_size: number;
  shards: Shard[];
}

export interface DestroyResponse {
  success?: boolean;
  warning?: boolean;
  unrecoverable?: boolean;
  surviving_shards?: number;
  threshold?: number;
  message?: string;
  active_shards?: number;
  destroyed_shards?: number;
  recoverable?: boolean;
  status?: string;
  shards?: Shard[];
}

export interface RecoverResponse {
  success: boolean;
  verified: boolean;
  log: string[];
  original_hash?: string;
  recovered_hash?: string;
  shards?: Shard[];
  status?: string;
  error?: string;
}

export interface StatusResponse {
  status: string;
  total_shards: number;
  data_shards: number;
  parity_shards: number;
  threshold: number;
}

export type AppPhase = 'init' | 'generated' | 'destroying' | 'warn' | 'recovering' | 'recovered' | 'failed';
