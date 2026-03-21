import type { MemoryStore } from "@ai-employee-sdk/core";

/**
 * Auto-pick store based on environment:
 * - Vercel KV in production (KV_REST_API_URL set)
 * - FileStore in local dev
 * - InMemoryStore as testing fallback
 */
export async function createStore(): Promise<MemoryStore> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    // Production: use Vercel KV
    const { KVStore } = await import("@ai-employee-sdk/store-kv");
    return new KVStore();
  }

  try {
    // Local dev: use FileStore
    const { FileStore } = await import("@ai-employee-sdk/store-file");
    return new FileStore({ dir: ".ai-employee" });
  } catch {
    // Fallback: in-memory (no persistence between requests)
    const { InMemoryStore } = await import("@ai-employee-sdk/core");
    return new InMemoryStore();
  }
}
