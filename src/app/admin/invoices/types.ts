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
