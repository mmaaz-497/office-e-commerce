import type { OrderStatus } from "./order/status";

/**
 * Every domain error carries a translation key instead of a hardcoded message
 * (FR-066, Constitution Principle I) — the UI layer resolves it in the active
 * locale; nothing here ever renders text directly.
 */
export class DomainError extends Error {
  readonly messageKey: string;

  constructor(messageKey: string, message?: string) {
    super(message ?? messageKey);
    this.name = new.target.name;
    this.messageKey = messageKey;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super("errors.invalidTransition", `Cannot transition order from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

export class InsufficientStockError extends DomainError {
  readonly available: number;
  readonly requested: number;

  constructor(available: number, requested: number) {
    super(
      "errors.insufficientStock",
      `Insufficient stock: requested ${requested}, available ${available}`,
    );
    this.available = available;
    this.requested = requested;
  }
}

export class CodUnavailableError extends DomainError {
  readonly provinceCode: string;

  constructor(provinceCode: string) {
    super("errors.codUnavailable", `COD is not available in province ${provinceCode}`);
    this.provinceCode = provinceCode;
  }
}

/** Deliberately detail-free — a failed lookup must not reveal why (FR-040). */
export class OrderLookupFailedError extends DomainError {
  constructor() {
    super("errors.orderLookupFailed");
  }
}

export class RateLimitedError extends DomainError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("errors.rateLimited", `Rate limited; retry after ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ReviewNotEligibleError extends DomainError {
  constructor() {
    super("errors.reviewNotEligible");
  }
}

export class DuplicateReviewError extends DomainError {
  constructor() {
    super("errors.duplicateReview");
  }
}

/** A CancellationRequest already exists for this order (unique on orderId). */
export class DuplicateCancellationRequestError extends DomainError {
  constructor() {
    super("errors.cancellationAlreadyRequested");
  }
}

/** No active admin session, or the session cookie failed verification (FR-055). */
export class AdminSessionError extends DomainError {
  constructor() {
    super("errors.unauthorized");
  }
}

/** FR-075 — a paid order with an unresolved fulfilment conflict can never be marked shipped. */
export class FulfilmentConflictError extends DomainError {
  constructor() {
    super("errors.fulfilmentConflict");
  }
}

/** The product was saved elsewhere since the form loaded (FR-011, optimistic concurrency). */
export class ProductChangedError extends DomainError {
  constructor() {
    super("errors.productChanged");
  }
}

/** Stock moved since the inline editor rendered; carries the value it moved to (R-313). */
export class StockChangedError extends DomainError {
  readonly currentQuantity: number;

  constructor(currentQuantity: number) {
    super("errors.stockChanged", `Stock changed; current quantity ${currentQuantity}`);
    this.currentQuantity = currentQuantity;
  }
}

/** The requested status is outside the publish gate (FR-024, R-309). */
export class StatusLockedError extends DomainError {
  constructor() {
    super("errors.statusLocked");
  }
}

/** The slug cannot change once the product has been published (FR-008, R-310). */
export class SlugLockedError extends DomainError {
  constructor() {
    super("errors.slugLocked");
  }
}

/** A sample is fixed at COMING_SOON until it is marked real (Constitution VII, R-402). */
export class SampleStatusLockedError extends DomainError {
  constructor() {
    super("errors.sampleStatusLocked");
  }
}

/** A sample never gets stock or ledger history; mark it real first (R-406, FR-017a). */
export class SampleStockLockedError extends DomainError {
  constructor() {
    super("errors.sampleStockLocked");
  }
}

/**
 * Taking an ACTIVE product off sale needs the owner's explicit confirmation
 * (R-404); `lastActive` says it is the only product on sale.
 */
export class UnpublishNeedsConfirmationError extends DomainError {
  readonly lastActive: boolean;

  constructor(lastActive: boolean) {
    super("errors.unpublishNeedsConfirmation");
    this.lastActive = lastActive;
  }
}
