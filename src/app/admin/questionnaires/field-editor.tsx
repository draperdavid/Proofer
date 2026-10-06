"use client";

// Field-definition rows for the questionnaire template builder. Mirrors the
// invoices line-items-editor pattern: a client component for editing, with
// the actual structure posted as a hidden `fields_json` field the server
// re-validates rather than trusting.
import { useState } from "react";
import type { QuestionnaireField, QuestionnaireFieldType } from "./types";

type Row = {
  label: string;
  type: QuestionnaireFieldType;
  required: boolean;
  options: string; // comma-separated, only rendered for multiple_choice
};

const FIELD_TYPES: { value: QuestionnaireFieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "date", label: "Date" },
];

function toRows(fields: QuestionnaireField[]): Row[] {
  if (fields.length === 0) {
    return [{ label: "", type: "short_text", required: false, options: "" }];
  }
  return fields
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((f) => ({
      label: f.label,
      type: f.type,
      required: f.required,
      options: (f.options ?? []).join(", "),
    }));
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `field-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FieldEditor({ fields }: { fields: QuestionnaireField[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(fields));

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { label: "", type: "short_text", required: false, options: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const fieldsJson = JSON.stringify(
    rows
      .filter((r) => r.label.trim().length > 0)
      .map((r, i) => ({
        id: newId(),
        label: r.label.trim(),
        type: r.type,
        required: r.required,
        options:
          r.type === "multiple_choice"
            ? r.options
                .split(",")
                .map((o) => o.trim())
                .filter((o) => o.length > 0)
            : [],
        position: i,
      }))
  );

  return (
    <div>
      <input type="hidden" name="fields_json" value={fieldsJson} />

      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Type</th>
            <th>Options (comma-separated)</th>
            <th>Required</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateRow(i, { label: e.target.value })}
                />
              </td>
              <td>
                <select
                  value={row.type}
                  onChange={(e) => updateRow(i, { type: e.target.value as QuestionnaireFieldType })}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="text"
                  value={row.options}
                  onChange={(e) => updateRow(i, { options: e.target.value })}
                  disabled={row.type !== "multiple_choice"}
                  placeholder={row.type === "multiple_choice" ? "e.g. Indoor, Outdoor, Both" : ""}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={row.required}
                  onChange={(e) => updateRow(i, { required: e.target.checked })}
                />
              </td>
              <td>
                <button type="button" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <button type="button" onClick={addRow}>
        + Add field
      </button>
    </div>
  );
}
