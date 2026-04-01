import { z } from "zod";
import { type Trigger, type Credentials, type TriggerType } from "@flowcore/types";
import { validationError } from "./errors.js";

// ---------------------------------------------------------------------------
// TriggerBuilder — fluent builder for connector triggers
// ---------------------------------------------------------------------------

type SubscribeFn<TConfig, TOutput> = (
  config: TConfig,
  credentials: Credentials,
  emit: (payload: TOutput) => void,
) => Promise<(() => Promise<void>) | void>;

export class TriggerBuilder<
  TConfig = unknown,
  TOutput = unknown,
  TConfigSchema extends z.ZodSchema<TConfig> = z.ZodSchema<TConfig>,
  TOutputSchema extends z.ZodSchema<TOutput> = z.ZodSchema<TOutput>,
> {
  private _id = "";
  private _name = "";
  private _description = "";
  private _type: TriggerType = "polling";
  private _outputSchema: TOutputSchema | undefined;
  private _configSchema: TConfigSchema | undefined;
  private _defaultPollIntervalSeconds: number | undefined;
  private _subscribe: SubscribeFn<TConfig, TOutput> | undefined;

  /**
   * Unique, snake_case identifier for this trigger.
   * e.g. "new_message", "contact_created"
   */
  id(id: string): this {
    this._id = id;
    return this;
  }

  /** Human-readable display name */
  name(name: string): this {
    this._name = name;
    return this;
  }

  /** One- or two-sentence description shown in the UI */
  description(description: string): this {
    this._description = description;
    return this;
  }

  /**
   * Trigger type.
   * - polling: FlowCore calls subscribe periodically
   * - webhook: FlowCore registers a webhook URL; upstream sends events
   * - realtime: persistent connection (WebSocket / SSE / etc.)
   */
  type(type: TriggerType): this {
    this._type = type;
    return this;
  }

  /** Default polling interval for "polling" triggers (seconds) */
  pollInterval(seconds: number): this {
    this._defaultPollIntervalSeconds = seconds;
    return this;
  }

  /**
   * Zod schema describing user-configurable options for this trigger
   * (e.g. which channel to watch, filter expressions, etc.)
   */
  config<S extends z.ZodSchema>(schema: S): TriggerBuilder<z.infer<S>, TOutput, S, TOutputSchema> {
    const next = this as unknown as TriggerBuilder<z.infer<S>, TOutput, S, TOutputSchema>;
    next._configSchema = schema as unknown as S;
    return next;
  }

  /**
   * Zod schema describing the shape of payloads emitted by this trigger.
   */
  output<S extends z.ZodSchema>(schema: S): TriggerBuilder<TConfig, z.infer<S>, TConfigSchema, S> {
    const next = this as unknown as TriggerBuilder<TConfig, z.infer<S>, TConfigSchema, S>;
    next._outputSchema = schema as unknown as S;
    return next;
  }

  /**
   * Subscribe function invoked by the FlowCore engine when a workflow is activated.
   *
   * - For `polling` triggers: call `emit` with each new event found; the engine
   *   will call subscribe again on the next poll cycle.
   * - For `webhook` triggers: register the webhook URL on the upstream API, then
   *   return an unsubscribe function that deregisters it when the workflow is deactivated.
   * - For `realtime` triggers: open a persistent connection, call `emit` as events
   *   arrive, and return an unsubscribe function that closes the connection.
   */
  subscribe(fn: SubscribeFn<TConfig, TOutput>): this {
    this._subscribe = fn;
    return this;
  }

  /**
   * Build and return the Trigger descriptor.
   */
  build(): Trigger {
    if (this._id === "") throw new Error("TriggerBuilder: id() is required");
    if (this._name === "") throw new Error("TriggerBuilder: name() is required");
    if (this._outputSchema === undefined) throw new Error(`TriggerBuilder(${this._id}): output() is required`);
    if (this._subscribe === undefined) throw new Error(`TriggerBuilder(${this._id}): subscribe() is required`);

    const configSchema = this._configSchema;
    const outputSchema = this._outputSchema;
    const subscribeFn = this._subscribe;
    const triggerId = this._id;

    const wrappedSubscribe = async (
      rawConfig: unknown,
      credentials: Credentials,
      emit: (payload: unknown) => void,
    ): Promise<(() => Promise<void>) | void> => {
      let validatedConfig: TConfig;

      if (configSchema !== undefined) {
        const result = configSchema.safeParse(rawConfig);
        if (!result.success) {
          throw validationError(
            `Invalid config for trigger "${triggerId}": ${result.error.message}`,
            result.error,
          );
        }
        validatedConfig = result.data as TConfig;
      } else {
        validatedConfig = rawConfig as TConfig;
      }

      const typedEmit = (payload: TOutput): void => {
        const result = outputSchema.safeParse(payload);
        if (!result.success) {
          throw validationError(
            `Invalid payload emitted by trigger "${triggerId}": ${result.error.message}`,
            result.error,
          );
        }
        emit(result.data);
      };

      return subscribeFn(validatedConfig, credentials, typedEmit);
    };

    return {
      id: this._id,
      name: this._name,
      description: this._description,
      type: this._type,
      outputSchema,
      configSchema,
      defaultPollIntervalSeconds: this._defaultPollIntervalSeconds,
      subscribe: wrappedSubscribe,
    };
  }
}

/**
 * Convenience factory — equivalent to `new TriggerBuilder()`.
 *
 * @example
 * ```ts
 * const newMessage = createTrigger()
 *   .id("new_message")
 *   .name("New Message")
 *   .description("Fires when a new message is posted to a channel")
 *   .type("webhook")
 *   .config(z.object({ channelId: z.string() }))
 *   .output(z.object({ text: z.string(), userId: z.string(), ts: z.string() }))
 *   .subscribe(async ({ channelId }, credentials, emit) => {
 *     // register webhook
 *     return async () => { /* deregister *\/ };
 *   })
 *   .build();
 * ```
 */
export function createTrigger(): TriggerBuilder {
  return new TriggerBuilder();
}
