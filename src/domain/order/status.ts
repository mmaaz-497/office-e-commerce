/**
 * Shared order-domain types. Kept separate from transitions.ts so errors.ts
 * (and anything else that only needs the type, not the transition table) does
 * not have to import the transition logic itself.
 */
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "COD_PENDING"
  | "CONFIRMED"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "RETURNED";

export type PaymentMethod = "ONLINE" | "COD";

export type Actor = "CUSTOMER" | "OWNER" | "PAYMENT_PROVIDER" | "SYSTEM";

export type AdminAction =
  | "CONFIRM_COD"
  | "MARK_SHIPPED"
  | "MARK_COMPLETED"
  | "MARK_RETURNED"
  | "CANCEL"
  | "APPROVE_CANCELLATION"
  | "REJECT_CANCELLATION";
