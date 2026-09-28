// Smart-field substitution for contract templates. A fixed, known set of
// tokens rather than generic object traversal — the whole point is that
// David can see exactly which fields exist (shown next to the template
// editor) rather than guessing at a schema. An unresolvable field (e.g. a
// contact with no phone) renders as an empty string, not an error — a
// photographer filling a template by hand would leave it blank too.
import type { Contact } from "../contacts/types";
import type { Project } from "../projects/types";

export const SMART_FIELD_TOKENS = [
  "{{contact.name}}",
  "{{contact.email}}",
  "{{contact.phone}}",
  "{{project.title}}",
  "{{project.event_date}}",
  "{{project.location}}",
  "{{today}}",
] as const;

export function fillSmartFields(body: string, contact: Contact, project: Project): string {
  const values: Record<string, string> = {
    "{{contact.name}}": contact.name ?? "",
    "{{contact.email}}": contact.email ?? "",
    "{{contact.phone}}": contact.phone ?? "",
    "{{project.title}}": project.title ?? "",
    "{{project.event_date}}": project.event_date ?? "",
    "{{project.location}}": project.location ?? "",
    "{{today}}": new Date().toISOString().slice(0, 10),
  };

  let result = body;
  for (const [token, value] of Object.entries(values)) {
    result = result.split(token).join(value);
  }
  return result;
}
