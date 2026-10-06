import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { createProduct } from "../actions";
import { ProductFields } from "../product-fields";
import type { ProductCategory } from "../types";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const { data, error } = await supabaseAdmin().from("product_categories").select("*").order("position");
  if (error) throw error;

  return (
    <main>
      <h1>New product</h1>
      <p>
        <Link href="/admin/store">Back to store</Link>
      </p>
      <form action={createProduct}>
        <ProductFields categories={(data ?? []) as ProductCategory[]} />
        <button type="submit">Create product</button>
      </form>
      <p style={{ fontSize: "0.8rem" }}>Add sizes or options (variants) on the next page.</p>
    </main>
  );
}
