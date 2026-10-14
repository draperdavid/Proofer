export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type DiscountType = "none" | "percent" | "flat";

export type Invoice = {
  id: string;
  project_id: string;
  contact_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  currency: string;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  stripe_checkout_session_id: string | null;
  // Set only by the verified Stripe webhook (2.3, migration 0022).
  paid_at: string | null;
  amount_paid_cents: number | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  position: number;
};

export type PaymentOutcome =
  | "paid"
  | "installment_paid"
  | "recorded"
  | "already_paid"
  | "not_payable"
  | "amount_mismatch"
  | "unknown_invoice";

export type PaymentEvent = {
  id: string;
  installment_id: string | null;
  stripe_event_id: string;
  type: string;
  livemode: boolean;
  amount_cents: number | null;
  currency: string | null;
  outcome: PaymentOutcome;
  received_at: string;
};

// One payment in a schedule (2.4, migration 0023). Invoices without rows are
// paid in full in one go.
export type InvoiceInstallment = {
  id: string;
  invoice_id: string;
  position: number;
  label: string;
  amount_cents: number;
  due_date: string | null;
  status: "unpaid" | "paid";
  paid_at: string | null;
};
