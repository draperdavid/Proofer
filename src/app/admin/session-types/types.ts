export type SessionType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number | null;
  currency: string;
  is_public: boolean;
  active: boolean;
  contract_template_id: string | null;
  questionnaire_template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateOption = { id: string; name: string };
