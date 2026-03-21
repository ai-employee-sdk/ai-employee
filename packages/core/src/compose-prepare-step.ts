/**
 * Composes multiple PrepareStepFunctions into one.
 *
 * Merge rules:
 * - system messages: CONCATENATE (each layer adds context)
 * - activeTools: INTERSECT (most restrictive wins)
 * - model/toolChoice: LAST WRITER WINS
 * - experimental_context: DEEP MERGE by namespace
 * - providerOptions: DEEP MERGE
 * - messages: LAST WRITER WINS (with dev warning)
 */

type PrepareStepFn = (options: {
  steps: any[];
  stepNumber: number;
  model: any;
  messages: any[];
  experimental_context: unknown;
}) => any | Promise<any>;

export function composePrepareStep(
  ...fns: (PrepareStepFn | undefined | null)[]
): PrepareStepFn {
  const validFns = fns.filter(
    (fn): fn is PrepareStepFn => typeof fn === 'function',
  );

  if (validFns.length === 0) {
    return () => undefined;
  }

  if (validFns.length === 1) {
    return validFns[0]!;
  }

  return async (options) => {
    let merged: Record<string, any> = {};

    for (const fn of validFns) {
      const result = await fn(options);
      if (!result) continue;

      // system: CONCATENATE
      if (result.system !== undefined) {
        merged['system'] = concatenateSystem(merged['system'], result.system);
      }

      // activeTools: INTERSECT
      if (result.activeTools !== undefined) {
        if (merged['activeTools'] !== undefined) {
          const existing = new Set(merged['activeTools'] as string[]);
          merged['activeTools'] = (result.activeTools as string[]).filter(
            (t: string) => existing.has(t),
          );
        } else {
          merged['activeTools'] = result.activeTools;
        }
      }

      // model: LAST WRITER WINS
      if (result.model !== undefined) {
        merged['model'] = result.model;
      }

      // toolChoice: LAST WRITER WINS
      if (result.toolChoice !== undefined) {
        merged['toolChoice'] = result.toolChoice;
      }

      // experimental_context: DEEP MERGE
      if (result.experimental_context !== undefined) {
        merged['experimental_context'] = deepMerge(
          merged['experimental_context'] ?? {},
          result.experimental_context,
        );
      }

      // providerOptions: DEEP MERGE
      if (result.providerOptions !== undefined) {
        merged['providerOptions'] = deepMerge(
          merged['providerOptions'] ?? {},
          result.providerOptions,
        );
      }

      // messages: LAST WRITER WINS
      if (result.messages !== undefined) {
        if (
          merged['messages'] !== undefined &&
          typeof globalThis !== 'undefined' &&
          (globalThis as any).process?.env?.['NODE_ENV'] !== 'production'
        ) {
          console.warn(
            '[ai-employee] composePrepareStep: multiple functions returned messages. Last writer wins.',
          );
        }
        merged['messages'] = result.messages;
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  };
}

function concatenateSystem(
  existing: any,
  incoming: any,
): any {
  if (!existing) return incoming;

  // Normalize both to arrays of system messages
  const existingArr = normalizeSystem(existing);
  const incomingArr = normalizeSystem(incoming);

  return [...existingArr, ...incomingArr];
}

function normalizeSystem(system: any): any[] {
  if (typeof system === 'string') {
    return [{ role: 'system' as const, content: system }];
  }
  if (Array.isArray(system)) return system;
  return [system];
}

function deepMerge(target: any, source: any): any {
  if (
    typeof target !== 'object' || target === null ||
    typeof source !== 'object' || source === null
  ) {
    return source;
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof result[key] === 'object' &&
      result[key] !== null &&
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(result[key]) &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
