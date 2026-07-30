import { Injectable } from "@nestjs/common";

export const MAX_ACCESS_CACHE_TTL_MS = 60_000;
export const MAX_ACCESS_CACHE_ENTRIES = 1_000;

export interface AccessCache {
  invalidateUser(userId: string, orgId: string): Promise<void>;
}

export interface AccessCacheKey {
  userId: string;
  orgId: string;
  tenantId?: string;
}

interface CacheEntry {
  readonly userId: string;
  readonly orgId: string;
  readonly expiresAt: number;
  readonly value: unknown;
}

@Injectable()
export class AccessCacheService implements AccessCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly generations = new Map<string, number>();
  private globalGeneration = 0;

  async getOrLoad<T>(
    key: AccessCacheKey,
    load: () => Promise<T>,
    validUntil?: Date,
  ): Promise<T> {
    const cacheKey = this.cacheKey(key);
    const now = Date.now();
    this.pruneExpired(now);
    const cached = this.entries.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    this.entries.delete(cacheKey);
    const generationKey = this.generationKey(key.userId, key.orgId);
    const generation = this.generations.get(generationKey) ?? 0;
    const globalGeneration = this.globalGeneration;
    const value = await load();
    const expiresAt = Math.min(
      now + MAX_ACCESS_CACHE_TTL_MS,
      validUntil?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    if (
      generation === (this.generations.get(generationKey) ?? 0) &&
      globalGeneration === this.globalGeneration &&
      expiresAt > Date.now()
    ) {
      this.pruneExpired(Date.now());
      this.evictOldestEntries();
      this.entries.set(cacheKey, {
        userId: key.userId,
        orgId: key.orgId,
        expiresAt,
        value,
      });
    }
    return value;
  }

  async invalidateUser(userId: string, orgId: string): Promise<void> {
    const generationKey = this.generationKey(userId, orgId);
    const nextGeneration = (this.generations.get(generationKey) ?? 0) + 1;
    this.globalGeneration += 1;
    this.generations.delete(generationKey);
    this.generations.set(generationKey, nextGeneration);
    this.pruneGenerations();

    for (const [key, entry] of this.entries) {
      if (entry.userId === userId && entry.orgId === orgId) {
        this.entries.delete(key);
      }
    }
  }

  private cacheKey({ userId, orgId, tenantId }: AccessCacheKey): string {
    return JSON.stringify([userId, orgId, tenantId ?? null]);
  }

  private generationKey(userId: string, orgId: string): string {
    return JSON.stringify([userId, orgId]);
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private evictOldestEntries(): void {
    while (this.entries.size >= MAX_ACCESS_CACHE_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as
        | string
        | undefined;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }

  private pruneGenerations(): void {
    while (this.generations.size > MAX_ACCESS_CACHE_ENTRIES) {
      const oldestKey = this.generations.keys().next().value as
        | string
        | undefined;
      if (oldestKey === undefined) return;
      this.generations.delete(oldestKey);
    }
  }
}
