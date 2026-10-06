import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { priceRange, sellableOptions } from "@/lib/store/catalog";
import { formatCents } from "../invoices/money";
import type { Product, ProductCategory, ProductVariant } from "./types";

export const dynamic = "force-dynamic";

function formatRange(product: Product, variants: ProductVariant[]): string {
  const range = priceRange(sellableOptions(product, variants));
  if (!range) return "Not for sale";
  const min = formatCents(range.min, product.currency);
  return range.min === range.max ? min : `${min} – ${formatCents(range.max, product.currency)}`;
}

export default async function StorePage() {
  const db = supabaseAdmin();
  const [categoriesRes, productsRes, variantsRes] = await Promise.all([
    db.from("product_categories").select("*").order("position"),
    db.from("products").select("*").order("name"),
    db.from("product_variants").select("*").order("position"),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;
  if (productsRes.error) throw productsRes.error;
  if (variantsRes.error) throw variantsRes.error;

  const categories = (categoriesRes.data ?? []) as ProductCategory[];
  const products = (productsRes.data ?? []) as Product[];
  const variants = (variantsRes.data ?? []) as ProductVariant[];

  const groups: { id: string; name: string; products: Product[] }[] = [
    ...categories.map((c) => ({ id: c.id, name: c.name, products: products.filter((p) => p.category_id === c.id) })),
    { id: "none", name: "Uncategorized", products: products.filter((p) => p.category_id === null) },
  ].filter((g) => g.products.length > 0);

  return (
    <main>
      <h1>Store</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
        {" | "}
        <Link href="/admin/store/categories">Categories</Link>
      </p>
      <p>
        <Link href="/admin/store/new">+ New product</Link>
      </p>
      <p style={{ fontSize: "0.8rem" }}>
        Self-fulfilled products you pack and ship. Clients can buy from galleries once checkout is built (7.2).
      </p>

      {groups.length === 0 && <p>No products yet.</p>}
      {groups.map((group) => (
        <section key={group.id}>
          <h2>{group.name}</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Variants</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {group.products.map((p) => {
                const own = variants.filter((v) => v.product_id === p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/store/${p.id}`}>{p.name}</Link>
                    </td>
                    <td>{formatRange(p, own)}</td>
                    <td>{own.length === 0 ? "—" : own.length}</td>
                    <td>{p.active ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
