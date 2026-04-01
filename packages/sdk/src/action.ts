import { z } from "zod";
import { type Action, type Credentials } from "@flowcore/types";
import { validationError } from "./errors.js";

// ---------------------------------------------------------------------------
// ActionBuilder — fluent builder for connector actions
// ---------------------------------------------------------------------------

type ExecuteFn<TInput, TOutput> = (input: TInput, credentials: Credentials) => Promise<TOutput>;

export class ActionBuilder<
  TInput = unknown,
  TOutput = unknown,
  TInputSchema extends z.ZodSchema<TInput> = z.ZodSchema<TInput>,
  TOutputSchema extends z.ZodSchema<TOutput> = z.ZodSchema<TOutput>,
> {
  private _id = "";
  private _name = "";
  private _description = "";
  private _inputSchema: TInputSchema | undefined;
  private _outputSchema: TOutputSchema | undefined;
  private _execute: ExecuteFn<TInput, TOutput> | undefined;

  /**
   * Unique, snake_case identifier for this action within the connector.
   * e.g. "send_message", "create_contact"
   */
  id(id: string): this {
    this._id = id;
    return this;
  }

  /** Human-readable display name shown in the UI */
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
   * Zod schema that validates the action's input.
   * The type parameter is inferred automatically.
   */
  input<S extends z.ZodSchema>(schema: S): ActionBuilder<z.infer<S>, TOutput, S, TOutputSchema> {
    const next = this as unknown as ActionBuilder<z.infer<S>, TOutput, S, TOutputSchema>;
    next._inputSchema = schema as unknown as S;
    return next;
  }

  /**
   * Zod schema that validates the action's output.
   * The type parameter is inferred automatically.
   */
  output<S extends z.ZodSchema>(schema: S): ActionBuilder<TInput, z.infer<S>, TInputSchema, S> {
    const next = this as unknown as ActionBuilder<TInput, z.infer<S>, TInputSchema, S>;
    next._outputSchema = schema as unknown as S;
    return next;
  }

  /**
   * Implementation function.
   * Receives the validated input and resolved credentials.
   */
  execute(fn: ExecuteFn<TInput, TOutput>): this {
    this._execute = fn;
    return this;
  }

  /**
   * Build and return the Action descriptor.
   * Throws if required fields are missing.
   */
  build(): Action {
    if (this._id === "") throw new Error("ActionBuilder: id() is required");
    if (this._name === "") throw new Error("ActionBuilder: name() is required");
    if (this._inputSchema === undefined) throw new Error(`ActionBuilder(${this._id}): input() is required`);
    if (this._outputSchema === undefined) throw new Error(`ActionBuilder(${this._id}): output() is required`);
    if (this._execute === undefined) throw new Error(`ActionBuilder(${this._id}): execute() is required`);

    const inputSchema = this._inputSchema;
    const outputSchema = this._outputSchema;
    const executeFn = this._execute;

    const wrappedExecute = async (rawInput: unknown, credentials: Credentials): Promise<unknown> => {
      const inputResult = inputSchema.safeParse(rawInput);
      if (!inputResult.success) {
        throw validationError(
          `Invalid input for action "${this._id}": ${inputResult.error.message}`,
          inputResult.error,
        );
      }

      const output = await executeFn(inputResult.data as TInput, credentials);

      const outputResult = outputSchema.safeParse(output);
      if (!outputResult.success) {
        throw validationError(
          `Invalid output from action "${this._id}": ${outputResult.error.message}`,
          outputResult.error,
        );
      }

      return outputResult.data;
    };

    return {
      id: this._id,
      name: this._name,
      description: this._description,
      inputSchema,
      outputSchema,
      execute: wrappedExecute,
    };
  }
}

/**
 * Convenience factory — equivalent to `new ActionBuilder()`.
 *
 * @example
 * ```ts
 * const sendMessage = createAction()
 *   .id("send_message")
 *   .name("Send Message")
 *   .description("Send a message to a Slack channel")
 *   .input(z.object({ channel: z.string(), text: z.string() }))
 *   .output(z.object({ ts: z.string(), ok: z.boolean() }))
 *   .execute(async ({ channel, text }, credentials) => {
 *     // ...
 *   })
 *   .build();
 * ```
 */
export function createAction(): ActionBuilder {
  return new ActionBuilder();
}
