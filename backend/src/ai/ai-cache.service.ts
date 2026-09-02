import { Injectable } from '@nestjs/common';

/**
 * Tiny in-request-scoped cache for deterministic NLU results (Member 3,
 * cost control). Keyed by the sha256 of the normalized input + language.
 * In-memory with TTL + size cap; safe to use because the classifier is
 * deterministic (same input → same output, no per-citizen state).
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class AiCacheService {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  // Plain field initializers (no constructor): Nest DI would try to resolve
  // primitive constructor parameters as dependencies.
  private readonly ttlMs = 300000;
  private readonly maxEntries = 1000;

  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  size(): number {
    return this.store.size;
  }
}
