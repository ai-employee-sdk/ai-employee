import { ToolLoopAgent, stepCountIs, type Agent, type ToolSet, type StopCondition } from 'ai';
import type { EmployeeAgentConfig, MembraneResult } from './types';
import { membrane } from './membrane';
import { composePrepareStep } from './compose-prepare-step';
import { createMemoryPrepareStep } from './memory';

/**
 * EmployeeAgent — a ~50-line Agent wrapper around ToolLoopAgent that composes
 * membrane + memory + user prepareStep via composePrepareStep.
 *
 * Delegates to ToolLoopAgent (publicly exported from 'ai') for Agent interface
 * compliance, generate(), and stream().
 */
export class EmployeeAgent<TOOLS extends ToolSet = Record<string, never>>
  implements Agent<never, TOOLS>
{
  private readonly inner: ToolLoopAgent<never, TOOLS>;
  private readonly _membrane: MembraneResult | undefined;

  constructor(config: EmployeeAgentConfig<TOOLS>) {
    // 1. Set up membrane if configured
    let wrappedTools: TOOLS;
    if (config.membrane) {
      this._membrane = membrane({
        ...config.membrane,
        tools: (config.tools ?? {}) as TOOLS,
      });
      wrappedTools = this._membrane.tools as TOOLS;
    } else {
      wrappedTools = (config.tools ?? {}) as TOOLS;
    }

    // 2. Compose prepareStep: membrane + memory + user-provided
    const prepareSteps: any[] = [];

    if (this._membrane) {
      prepareSteps.push(this._membrane.prepareStep);
    }

    if (config.memory) {
      prepareSteps.push(
        createMemoryPrepareStep(config.memory.store, config.memory.config),
      );
    }

    if (config.prepareStep) {
      if (Array.isArray(config.prepareStep)) {
        prepareSteps.push(...config.prepareStep);
      } else {
        prepareSteps.push(config.prepareStep);
      }
    }

    const composedPrepareStep =
      prepareSteps.length > 0
        ? composePrepareStep(...prepareSteps)
        : undefined;

    // 3. Compose stop conditions: maxSteps + user-provided stopWhen
    const stopConditions: StopCondition<any>[] = [];
    if (config.maxSteps !== undefined) {
      stopConditions.push(stepCountIs(config.maxSteps));
    }
    if (config.stopWhen) {
      if (Array.isArray(config.stopWhen)) {
        stopConditions.push(...config.stopWhen);
      } else {
        stopConditions.push(config.stopWhen);
      }
    }

    // 4. Create inner ToolLoopAgent
    this.inner = new ToolLoopAgent({
      id: config.id,
      model: config.model,
      instructions: config.instructions,
      tools: wrappedTools,
      prepareStep: composedPrepareStep,
      stopWhen: stopConditions.length > 0 ? stopConditions : undefined,
      experimental_onToolCallFinish: this._membrane?.onToolCallFinish as any,
      onStepFinish: config.onStepFinish,
      onFinish: config.onFinish,
    });
  }

  get version(): 'agent-v1' {
    return this.inner.version;
  }

  get id(): string | undefined {
    return this.inner.id;
  }

  get tools(): TOOLS {
    return this.inner.tools;
  }

  /**
   * Get the audit log (only available if membrane is configured).
   */
  get auditLog() {
    return this._membrane?.auditLog ?? [];
  }

  generate(options: any) {
    return this.inner.generate(options);
  }

  stream(options: any) {
    return this.inner.stream(options);
  }
}
