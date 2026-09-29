export type QuestionnaireFieldType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "email"
  | "date";

export type QuestionnaireField = {
  id: string;
  label: string;
  type: QuestionnaireFieldType;
  required: boolean;
  options: string[]; // only used by multiple_choice
  position: number;
};

export type QuestionnaireTemplate = {
  id: string;
  name: string;
  fields: QuestionnaireField[];
  created_at: string;
  updated_at: string;
};

// Keyed by QuestionnaireField.id. Every answer is stored as a string
// ("true"/"false" for checkbox) so the shape stays uniform for jsonb storage.
export type QuestionnaireAnswers = Record<string, string>;

export type Questionnaire = {
  id: string;
  project_id: string;
  contact_id: string;
  template_id: string | null;
  fields: QuestionnaireField[];
  answers: QuestionnaireAnswers;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};
