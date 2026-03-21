import type { MemoryStore, MemoryPrepareStepConfig } from './types';

/**
 * Creates a PrepareStepFunction that injects memories at step 0 only.
 *
 * Frozen snapshot pattern (from Hermes Agent):
 * - Reads all matching memory keys at step 0
 * - Formats as a system message
 * - Does NOT re-read on subsequent steps (preserves KV cache hits)
 *
 * @param store - MemoryStore to read from
 * @param config - Optional configuration for token budget and key filtering
 */
export function createMemoryPrepareStep(
  store: MemoryStore,
  config?: MemoryPrepareStepConfig,
) {
  const prefix = config?.prefix ?? 'memory:';
  const maxTokenBudget = config?.maxTokenBudget ?? 2000;

  // Cache the snapshot after first read
  let cachedSnapshot: string | null = null;

  return async (options: {
    steps: any[];
    stepNumber: number;
    model: any;
    messages: any[];
    experimental_context: unknown;
  }) => {
    // Only inject at step 0 (frozen snapshot)
    if (options.stepNumber !== 0) return undefined;

    if (cachedSnapshot === null) {
      // Read all memory keys
      const keys = config?.memoryKeys ?? (await store.list(prefix));
      const entries: Array<{ key: string; value: unknown }> = [];

      for (const key of keys) {
        const value = await store.get(key);
        if (value !== null) {
          entries.push({ key, value });
        }
      }

      if (entries.length === 0) {
        cachedSnapshot = '';
        return undefined;
      }

      // Format as text, respecting token budget
      // Rough estimate: 1 token ~ 4 chars
      const maxChars = maxTokenBudget * 4;
      let text = '<memories>\n';
      for (const entry of entries) {
        const line = `[${entry.key}]: ${JSON.stringify(entry.value)}\n`;
        if (text.length + line.length > maxChars) break;
        text += line;
      }
      text += '</memories>';
      cachedSnapshot = text;
    }

    if (!cachedSnapshot) return undefined;

    return {
      system: cachedSnapshot,
    };
  };
}
