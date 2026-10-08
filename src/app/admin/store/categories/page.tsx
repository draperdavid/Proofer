import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { createCategory, deleteCategory, moveCategory, renameCategory } from "../actions";
import type { ProductCategory } from "../types";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const db = supabaseAdmin();
  const [categoriesRes, productsRes] = await Promise.all([
    db.from("product_categories").select("*").order("position"),
    db.from("products").select("category_id"),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;
  if (productsRes.error) throw productsRes.error;

  const categories = (categoriesRes.data ?? []) as ProductCategory[];
  const counts = new Map<string, number>();
  for (const p of productsRes.data ?? []) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }

  return (
    <main>
      <h1>Store categories</h1>
      <p>
        <Link className="back" href="/admin/store">← Back to store</Link>
      </p>

      {categories.length === 0 && <p>No categories yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {categories.map((c, i) => {
          const rename = renameCategory.bind(null, c.id);
          const up = moveCategory.bind(null, c.id, "up");
          const down = moveCategory.bind(null, c.id, "down");
          const remove = deleteCategory.bind(null, c.id);
          const count = counts.get(c.id) ?? 0;
          return (
            <li key={c.id} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              <form action={rename} style={{ display: "flex", gap: "0.5rem" }}>
                <input name="name" type="text" required defaultValue={c.name} aria-label="Category name" />
                <button type="submit">Rename</button>
              </form>
              <span>
                {count} product{count === 1 ? "" : "s"}
              </span>
              <form action={up}>
                <button type="submit" disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
              </form>
              <form action={down}>
                <button type="submit" disabled={i === categories.length - 1} aria-label="Move down">
                  ↓
                </button>
              </form>
              <form action={remove}>
                <button type="submit">Delete{count > 0 ? " (products become uncategorized)" : ""}</button>
              </form>
            </li>
          );
        })}
      </ul>

      <h2>Add a category</h2>
      <form action={createCategory} style={{ display: "flex", gap: "0.5rem" }}>
        <input name="name" type="text" placeholder="e.g. Prints" required />
        <button type="submit">Add category</button>
      </form>
    </main>
  );
}
