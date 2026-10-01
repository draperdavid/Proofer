import type { SessionType, TemplateOption } from "./types";

function centsToDollarInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

// Shared form fields for the new and edit session-type pages.
export function SessionTypeFields({
  sessionType,
  contractTemplates,
  questionnaireTemplates,
}: {
  sessionType?: Partial<SessionType>;
  contractTemplates: TemplateOption[];
  questionnaireTemplates: TemplateOption[];
}) {
  return (
    <>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required defaultValue={sessionType?.name ?? ""} />
      </div>
      <div>
        <label htmlFor="slug">URL slug (blank = from name)</label>
        <input id="slug" name="slug" type="text" defaultValue={sessionType?.slug ?? ""} />
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={sessionType?.description ?? ""} />
      </div>
      <div>
        <label htmlFor="image_url">Cover image URL</label>
        <input id="image_url" name="image_url" type="url" defaultValue={sessionType?.image_url ?? ""} />
      </div>
      <div>
        <label htmlFor="duration_minutes">Duration (minutes)</label>
        <input
          id="duration_minutes"
          name="duration_minutes"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={sessionType?.duration_minutes ?? 60}
        />
      </div>
      <div>
        <label htmlFor="price">Price ($)</label>
        <input
          id="price"
          name="price"
          type="number"
          min={0}
          step="0.01"
          defaultValue={centsToDollarInput(sessionType?.price_cents ?? 0)}
        />
      </div>
      <div>
        <label htmlFor="deposit">Deposit ($, blank = pay in full)</label>
        <input
          id="deposit"
          name="deposit"
          type="number"
          min={0}
          step="0.01"
          defaultValue={centsToDollarInput(sessionType?.deposit_cents)}
        />
      </div>
      <div>
        <label>
          <input name="is_public" type="checkbox" defaultChecked={sessionType?.is_public ?? true} /> Public
          (listed on the booking page; unchecked = direct link only)
        </label>
      </div>
      <div>
        <label>
          <input name="active" type="checkbox" defaultChecked={sessionType?.active ?? true} /> Active (bookable)
        </label>
      </div>
      <div>
        <label htmlFor="contract_template_id">Contract to attach</label>
        <select
          id="contract_template_id"
          name="contract_template_id"
          defaultValue={sessionType?.contract_template_id ?? ""}
        >
          <option value="">None</option>
          {contractTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="questionnaire_template_id">Questionnaire to attach</label>
        <select
          id="questionnaire_template_id"
          name="questionnaire_template_id"
          defaultValue={sessionType?.questionnaire_template_id ?? ""}
        >
          <option value="">None</option>
          {questionnaireTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
