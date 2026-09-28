export type ContractStatus = "draft" | "awaiting_signature" | "in_progress" | "completed" | "canceled";

export type ContractTemplate = {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type Contract = {
  id: string;
  project_id: string;
  contact_id: string;
  template_id: string | null;
  status: ContractStatus;
  filled_body: string;
  created_at: string;
  updated_at: string;
};
