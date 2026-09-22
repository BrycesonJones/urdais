/**
 * Typed failures for UMPI ingestion.
 *
 * The classes exist so that an operator, and later a monitor, can tell apart "the key is
 * missing" from "the agency is down" from "the agency changed its payload" from "this row is
 * not the series we are bound to". Those four need different responses, and a single Error
 * with a string message makes them indistinguishable.
 */

export type UmpiErrorKind =
  | "configuration"
  | "transport"
  | "provider"
  | "parse"
  | "validation"
  | "identity"
  | "persistence";

export abstract class UmpiIngestError extends Error {
  abstract readonly kind: UmpiErrorKind;
  /** Whether trying the same request again could plausibly succeed. */
  retryable: boolean = false;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
  }
}

/** A required key or setting is absent. Retrying changes nothing. */
export class UmpiConfigurationError extends UmpiIngestError {
  readonly kind = "configuration" as const;
}

/** The request never produced a usable HTTP response: timeout, socket failure, 5xx. */
export class UmpiTransportError extends UmpiIngestError {
  readonly kind = "transport" as const;
  constructor(message: string, readonly status: number | null, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.retryable = retryable;
  }
}

/**
 * The agency answered, and the answer is an error. This is never treated as "no data": an
 * expired key and a month with no exports are different facts and must not collapse.
 */
export class UmpiProviderError extends UmpiIngestError {
  readonly kind = "provider" as const;
  constructor(message: string, readonly providerCode: string | null, readonly providerMessage: string | null) {
    super(message);
  }
}

/** The payload arrived but is not the shape the agency documents. */
export class UmpiParseError extends UmpiIngestError {
  readonly kind = "parse" as const;
}

/** A row is well-formed but not admissible. Carries the machine code for the run record. */
export class UmpiValidationError extends UmpiIngestError {
  readonly kind = "validation" as const;
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** The response is a different series from the one requested. The loudest failure here. */
export class UmpiIdentityMismatchError extends UmpiIngestError {
  readonly kind = "identity" as const;
  constructor(message: string, readonly expected: string, readonly actual: string) {
    super(message);
  }
}

export class UmpiPersistenceError extends UmpiIngestError {
  readonly kind = "persistence" as const;
}
