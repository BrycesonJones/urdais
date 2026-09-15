/**
 * Why a live numerator retrieval refused to produce an observation.
 *
 * One vocabulary for the whole retrieval boundary, kept apart from the validation problem
 * types in ../chainlink.ts and ../numerator.ts because they answer a different question.
 * Those say "this recorded observation does not check out"; these say "no observation could
 * be made at all". An operator's response differs completely -- a stale round means wait,
 * an unreachable endpoint means look at the endpoint, a cross-check disagreement means look
 * at both -- and collapsing them into one "retrieval failed" would throw away the only
 * thing worth logging.
 *
 * Every one of these ends the same way: nothing is written, and no UBWI history row exists
 * for that run.
 */
export type RetrievalProblem =
  /** Fewer than two RPC endpoints are configured, so no cross-check is possible. */
  | "RPC_ENDPOINTS_INSUFFICIENT"
  /** An endpoint could not be reached, timed out, or answered a JSON-RPC error. */
  | "RPC_UNAVAILABLE"
  /** An endpoint answered, but not with something the documented return shape decodes. */
  | "RPC_MALFORMED_RESPONSE"
  /** The second, independent endpoint did not return the same round as the first. */
  | "FEED_CROSS_CHECK_DISAGREES"
  /** The contract's own `phaseId()` disagrees with the phase encoded in the round id. */
  | "FEED_PHASE_DISAGREES"
  /** The assembled round failed ../chainlink.ts's validator for a reason other than age. */
  | "FEED_OBSERVATION_INVALID"
  /** The latest round is already older than the heartbeat at the moment it was read. */
  | "FEED_OBSERVATION_STALE"
  /** A chain-tip source could not be reached or did not answer with an integer. */
  | "HEIGHT_SOURCE_UNAVAILABLE"
  /** The independent chain-tip sources returned different integers. */
  | "HEIGHT_SOURCES_DISAGREE"
  /** The scheduled-supply arithmetic refused the retrieved height. */
  | "SUPPLY_DERIVATION_FAILED"
  /**
   * The height leg and the price leg were read too far apart to be one instant. The
   * numerator is a product of two quantities and is only a market capitalization *at an
   * instant* if both were observed within a narrow window of each other.
   */
  | "OBSERVATION_WINDOW_EXCEEDED"
  /** The assembled observation failed the numerator's own checks. */
  | "NUMERATOR_INVALID";

/**
 * A fail-closed refusal from the retrieval layer.
 *
 * Carries the problem code, a detail line safe to log, and nothing else. In particular it
 * never carries a partial observation: a retrieval either produces something that passed
 * every check or it produces this, and there is no third state a caller could mistake for
 * a usable numerator.
 */
export class NumeratorRetrievalError extends Error {
  readonly problem: RetrievalProblem;
  constructor(problem: RetrievalProblem, detail: string) {
    super(`${problem}: ${detail}`);
    this.name = "NumeratorRetrievalError";
    this.problem = problem;
  }
}

export function isNumeratorRetrievalError(error: unknown): error is NumeratorRetrievalError {
  return error instanceof NumeratorRetrievalError;
}
