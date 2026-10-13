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
  // Set when signed (Phase 3.2); see migration 0020.
  signer_name: string | null;
  signer_email: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_title: string | null;
  signed_client_name: string | null;
  body_sha256: string | null;
  pdf_sha256: string | null;
  sent_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractEvent = {
  id: string;
  contract_id: string;
  event: "sent" | "signed" | "canceled";
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
};
