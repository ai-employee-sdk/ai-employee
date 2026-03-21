import type { HeartbeatConfig, HeartbeatResult } from './types';

const STATE_KEY = 'heartbeat:state';

interface HeartbeatState {
  lastTick: number;
  consecutiveErrors: number;
  circuitOpen: boolean;
}

/**
 * Creates a heartbeat — a pure tick function for always-on agents.
 *
 * The user brings the scheduler (setInterval, Cron, Workflow).
 * We provide the logic: concurrency guard, state persistence, circuit breaker.
 *
 * @param agent - Any object with a generate() method (Agent interface)
 * @param config - Heartbeat configuration
 */
export function createHeartbeat(
  agent: { generate: (options: { prompt: string }) => Promise<unknown> },
  config: HeartbeatConfig,
): HeartbeatResult {
  let running = false;
  const maxErrors = config.maxConsecutiveErrors ?? 5;

  async function loadState(): Promise<HeartbeatState> {
    if (!config.state) {
      return { lastTick: 0, consecutiveErrors: 0, circuitOpen: false };
    }
    const state = await config.state.get<HeartbeatState>(STATE_KEY);
    return state ?? { lastTick: 0, consecutiveErrors: 0, circuitOpen: false };
  }

  async function saveState(state: HeartbeatState): Promise<void> {
    if (!config.state) return;
    await config.state.set(STATE_KEY, state);
  }

  async function tick(): Promise<{ prompt: string; response: unknown } | null> {
    // Concurrency guard: skip if already running
    if (running) return null;

    // Abort signal check
    if (config.signal?.aborted) return null;

    running = true;
    try {
      const state = await loadState();

      // Circuit breaker: if open, skip
      if (state.circuitOpen) {
        return null;
      }

      // Check for work
      const prompt = await config.checkWork();
      if (prompt === null) {
        // No work to do — reset error count on successful check
        await saveState({
          ...state,
          lastTick: Date.now(),
          consecutiveErrors: 0,
        });
        return null;
      }

      // Run the agent
      try {
        const response = await agent.generate({ prompt });
        await saveState({
          lastTick: Date.now(),
          consecutiveErrors: 0,
          circuitOpen: false,
        });
        return { prompt, response };
      } catch (error) {
        const newErrors = state.consecutiveErrors + 1;
        const circuitOpen = newErrors >= maxErrors;
        await saveState({
          lastTick: Date.now(),
          consecutiveErrors: newErrors,
          circuitOpen,
        });
        throw error;
      }
    } finally {
      running = false;
    }
  }

  function isRunning(): boolean {
    return running;
  }

  return { tick, isRunning };
}
