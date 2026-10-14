// After a booking's payment lands (Phase 4.4). The database has already
// confirmed the booking (migration 0024 trigger, fired by the verified
// webhook); this does the follow-up once: move the project to Booked, send
// the session type's contract and questionnaire, and email the client a
// confirmation. Claimed via intake_sent_at so a redelivered webhook or a
// later balance payment never repeats it. Never throws: the payment is
// already recorded, and a follow-up problem must not turn the webhook into
// a 500 that Stripe retries.
import { supabaseAdmin } from "@/lib/supabase";
import { fillSmartFields } from "@/app/admin/contracts/smart-fields";
import type { Contact } from "@/app/admin/contacts/types";
import type { Project } from "@/app/admin/projects/types";
import { onContractSent, onQuestionnaireSent, onStageEntered, onBookingConfirmed } from "@/lib/email/triggers";
import { isMissingTable } from "@/lib/db-errors";

export async function onBookingPaid(invoiceId: string): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { data: claimed, error: claimError } = await db
      .from("bookings")
      .update({ intake_sent_at: new Date().toISOString() })
      .eq("invoice_id", invoiceId)
      .eq("status", "confirmed")
      .is("intake_sent_at", null)
      .select("id, project_id, contact_id, session_type_id")
      .maybeSingle();
    if (isMissingTable(claimError)) return;
    if (claimError) throw claimError;
    if (!claimed || !claimed.project_id || !claimed.contact_id) return;

    const [{ data: type }, { data: project }, { data: contact }, { data: booked }] = await Promise.all([
      db.from("session_types").select("contract_template_id, questionnaire_template_id").eq("id", claimed.session_type_id).single(),
      db.from("projects").select("*").eq("id", claimed.project_id).single(),
      db.from("contacts").select("*").eq("id", claimed.contact_id).single(),
      db.from("project_stages").select("id").ilike("name", "booked").limit(1),
    ]);
    if (!type || !project || !contact) throw new Error("Booking records missing");

    // Paid means booked: move the card, and let David's stage emails fire.
    const bookedStage = booked?.[0]?.id as string | undefined;
    if (bookedStage && project.stage_id !== bookedStage) {
      const { error } = await db.from("projects").update({ stage_id: bookedStage }).eq("id", project.id);
      if (error) throw error;
      await onStageEntered(project.id, bookedStage);
    }

    if (type.contract_template_id) {
      const { data: template } = await db
        .from("contract_templates")
        .select("id, body")
        .eq("id", type.contract_template_id)
        .single();
      if (template) {
        const now = new Date().toISOString();
        const { data: contract, error } = await db
          .from("contracts")
          .insert({
            project_id: project.id,
            contact_id: contact.id,
            template_id: template.id,
            filled_body: fillSmartFields(template.body, contact as Contact, project as Project),
          })
          .select("id")
          .single();
        if (error || !contract) throw error ?? new Error("Contract insert failed");
        const { error: sendError } = await db
          .from("contracts")
          .update({ status: "awaiting_signature", sent_at: now, updated_at: now })
          .eq("id", contract.id)
          .eq("status", "draft");
        if (sendError) throw sendError;
        const { error: eventError } = await db.from("contract_events").insert({
          contract_id: contract.id,
          event: "sent",
          detail: "Sent automatically with an online booking",
        });
        if (eventError) throw eventError;
        await onContractSent(contract.id);
      }
    }

    if (type.questionnaire_template_id) {
      const { data: template } = await db
        .from("questionnaire_templates")
        .select("id, fields")
        .eq("id", type.questionnaire_template_id)
        .single();
      if (template) {
        const { data: q, error } = await db
          .from("questionnaires")
          .insert({ project_id: project.id, contact_id: contact.id, template_id: template.id, fields: template.fields })
          .select("id")
          .single();
        if (error || !q) throw error ?? new Error("Questionnaire insert failed");
        await onQuestionnaireSent(q.id);
      }
    }

    await onBookingConfirmed(claimed.id);
  } catch (err) {
    console.error("booking follow-up failed", invoiceId, err);
  }
}
