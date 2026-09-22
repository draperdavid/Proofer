export type ContactKind = "lead" | "client";

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  kind: ContactKind;
  tags: string[];
  source: string | null;
  stripe_customer_id: string | null;
  notes: string | null;
  created_at: string;
};
