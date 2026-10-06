"use server";

// Store catalog CRUD (Phase 7.1). Runs behind the /admin/:path* middleware
// auth gate, so these actions trust the caller and use the service-role
// client directly. Validation mirrors the DB checks in 0015_store_catalog.sql
// so David gets a readable error instead of a raw Postgres one.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { parsePriceCents } from "@/lib/store/catalog";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Postgres unique_violation, turned into the one message that fits the table.
function rethrow(error: { code?: string }, uniqueMessage: string): never {
  if (error.code === "23505") throw new Error(uniqueMessage);
  throw error;
}

function revalidateProduct(id: string) {
  revalidatePath("/admin/store");
  revalidatePath(`/admin/store/${id}`);
}

// Swaps position with the nearest neighbour in the given direction, same as
// gallery sets: positions come from a sequence, so they never tie.
async function swapWithNeighbour(
  table: "product_categories" | "product_variants",
  scope: { column: "product_id"; value: string } | null,
  id: string,
  position: number,
  direction: "up" | "down"
) {
  const db = supabaseAdmin();
  let query = db
    .from(table)
    .select("id, position")
    .filter("position", direction === "up" ? "lt" : "gt", position);
  if (scope) query = query.eq(scope.column, scope.value);
  const { data: neighbour, error } = await query
    .order("position", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!neighbour) return;

  const [a, b] = await Promise.all([
    db.from(table).update({ position: neighbour.position }).eq("id", id),
    db.from(table).update({ position }).eq("id", neighbour.id),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

// ----------------------------------------------------------------- categories

export async function createCategory(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Category name is required");

  const { error } = await supabaseAdmin().from("product_categories").insert({ name });
  if (error) rethrow(error, `There's already a category called "${name}"`);

  revalidatePath("/admin/store/categories");
  revalidatePath("/admin/store");
}

export async function renameCategory(id: string, formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Category name is required");

  const { error } = await supabaseAdmin().from("product_categories").update({ name }).eq("id", id);
  if (error) rethrow(error, `There's already a category called "${name}"`);

  revalidatePath("/admin/store/categories");
  revalidatePath("/admin/store");
}

export async function moveCategory(id: string, direction: "up" | "down") {
  const { data: category, error } = await supabaseAdmin()
    .from("product_categories")
    .select("id, position")
    .eq("id", id)
    .single();
  if (error) throw error;

  await swapWithNeighbour("product_categories", null, category.id, category.position, direction);
  revalidatePath("/admin/store/categories");
  revalidatePath("/admin/store");
}

// Products in it become uncategorized (on delete set null); none are deleted.
export async function deleteCategory(id: string) {
  const { error } = await supabaseAdmin().from("product_categories").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/store/categories");
  revalidatePath("/admin/store");
}

// ------------------------------------------------------------------- products

function productFields(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");

  const slug = slugify(str(formData.get("slug")) ?? name);
  if (!slug) throw new Error("Slug must contain at least one letter or number");

  return {
    name,
    slug,
    category_id: str(formData.get("category_id")),
    description: str(formData.get("description")),
    price_cents: parsePriceCents(String(formData.get("price") ?? "")) ?? 0,
    requires_shipping: formData.get("requires_shipping") === "on",
    active: formData.get("active") === "on",
  };
}

export async function createProduct(formData: FormData) {
  const fields = productFields(formData);

  const { data, error } = await supabaseAdmin().from("products").insert(fields).select("id").single();
  if (error) rethrow(error, `Slug "${fields.slug}" is already used by another product`);

  revalidatePath("/admin/store");
  redirect(`/admin/store/${data.id}`);
}

export async function updateProduct(id: string, formData: FormData) {
  const fields = productFields(formData);

  const { error } = await supabaseAdmin()
    .from("products")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) rethrow(error, `Slug "${fields.slug}" is already used by another product`);

  revalidateProduct(id);
}

// Variants go with it (on delete cascade). Once orders exist (7.3) they keep
// a snapshot of name and price, so deleting a product never rewrites history.
export async function deleteProduct(id: string) {
  const { error } = await supabaseAdmin().from("products").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/store");
  redirect("/admin/store");
}

// ------------------------------------------------------------------- variants

function variantFields(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Variant name is required");

  return {
    name,
    sku: str(formData.get("sku")),
    // Blank = use the product's price.
    price_cents: parsePriceCents(String(formData.get("price") ?? "")),
  };
}

export async function createVariant(productId: string, formData: FormData) {
  const fields = variantFields(formData);

  const { error } = await supabaseAdmin()
    .from("product_variants")
    .insert({ ...fields, product_id: productId });
  if (error) rethrow(error, `This product already has a variant called "${fields.name}"`);

  revalidateProduct(productId);
}

export async function updateVariant(variantId: string, productId: string, formData: FormData) {
  const fields = variantFields(formData);

  const { error } = await supabaseAdmin()
    .from("product_variants")
    .update({ ...fields, active: formData.get("active") === "on" })
    .eq("id", variantId)
    .eq("product_id", productId);
  if (error) rethrow(error, `This product already has a variant called "${fields.name}"`);

  revalidateProduct(productId);
}

export async function moveVariant(variantId: string, direction: "up" | "down") {
  const { data: variant, error } = await supabaseAdmin()
    .from("product_variants")
    .select("id, product_id, position")
    .eq("id", variantId)
    .single();
  if (error) throw error;

  await swapWithNeighbour(
    "product_variants",
    { column: "product_id", value: variant.product_id },
    variant.id,
    variant.position,
    direction
  );
  revalidateProduct(variant.product_id);
}

export async function deleteVariant(variantId: string, productId: string) {
  const { error } = await supabaseAdmin()
    .from("product_variants")
    .delete()
    .eq("id", variantId)
    .eq("product_id", productId);
  if (error) throw error;

  revalidateProduct(productId);
}
