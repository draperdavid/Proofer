export type Project = {
  id: string;
  contact_id: string | null;
  stage_id: string | null;
  title: string;
  type: string | null;
  event_date: string | null;
  location: string | null;
  description: string | null;
  private_notes: string | null;
  archived: boolean;
  position: number;
  created_at: string;
};

export type ProjectStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
};
