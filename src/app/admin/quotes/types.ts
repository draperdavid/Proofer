export type QuoteStatus = "draft" | "sent" | "accepted";

export type QuotePackageLineItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
};

export type Quote = {
  id: string;
  project_id: string;
  contact_id: string;
  title: string;
  status: QuoteStatus;
  currency: string;
  tax_rate: number;
  notes: string | null;
  accepted_package_id: string | null;
  accepted_at: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QuotePackage = {
  id: string;
  quote_id: string;
  name: string;
  description: string | null;
  line_items: QuotePackageLineItem[];
  position: number;
};
