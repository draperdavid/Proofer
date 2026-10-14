import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { centsToInput, sellableOptions, variantPrice } from "@/lib/store/catalog";
import { formatCents } from "../../invoices/money";
import {
  createVariant,
  deleteProduct,
  deleteVariant,
  moveVariant,
  updateProduct,
  updateVariant,
} from "../actions";
import { ProductFields } from "../product-fields";
import type { Product, ProductCategory, ProductVariant } from "../types";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";
import { presignGet, r2Configured } from "@/lib/r2";
import { ProductImageUpload } from "../image-upload";
import { removeProductImage } from "../image-actions";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [productRes, variantsRes, categoriesRes] = await Promise.all([
    db.from("products").select("*").eq("id", id).single(),
    db.from("product_variants").select("*").eq("product_id", id).order("position"),
    db.from("product_categories").select("*").order("position"),
  ]);
  if (productRes.error || !productRes.data) notFound();
  if (variantsRes.error) throw variantsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  const product = productRes.data as Product;
  const variants = (variantsRes.data ?? []) as ProductVariant[];
  const categories = (categoriesRes.data ?? []) as ProductCategory[];
  const options = sellableOptions(product, variants);

  const updateThis = updateProduct.bind(null, product.id);
  const deleteThis = deleteProduct.bind(null, product.id);
  const addVariant = createVariant.bind(null, product.id);
  const imageKey = (product as Product & { image_key?: string | null }).image_key ?? null;
  const imageUrl = imageKey && r2Configured() ? await presignGet(imageKey) : null;

  return (
    <main>
      <h1>{product.name}</h1>
      <p>
        <Link className="back" href="/admin/store">← Back to store</Link>
      </p>

      <form action={updateThis}>
        <ProductFields product={product} categories={categories} />
        <button type="submit">Save product</button>
      </form>

      <h2>Image</h2>
      <p className="hint">Shown on the Shop tab of galleries with the store turned on.</p>
      {imageUrl && <img src={imageUrl} alt="" style={{ maxWidth: 240, display: "block", marginBottom: 8 }} />}
      <ProductImageUpload productId={product.id} />
      {imageKey && (
        <form action={removeProductImage.bind(null, product.id)}>
          <button type="submit">Remove image</button>
        </form>
      )}

      <h2>Variants</h2>
      <p className="hint">
        Sizes or options, e.g. 8x10 / 11x14. Leave a variant&apos;s price blank to use the product price. With no
        variants, the product sells as-is.
      </p>
      {variants.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Price (blank = {formatCents(product.price_cents, product.currency)})</th>
              <th>Active</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const formId = `variant-${v.id}`;
              const update = updateVariant.bind(null, v.id, product.id);
              const up = moveVariant.bind(null, v.id, "up");
              const down = moveVariant.bind(null, v.id, "down");
              const remove = deleteVariant.bind(null, v.id, product.id);
              return (
                <tr key={v.id}>
                  <td>
                    <input form={formId} name="name" type="text" required defaultValue={v.name} aria-label="Name" />
                  </td>
                  <td>
                    <input form={formId} name="sku" type="text" defaultValue={v.sku ?? ""} aria-label="SKU" />
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="price"
                      type="text"
                      inputMode="decimal"
                      defaultValue={centsToInput(v.price_cents)}
                      aria-label="Price"
                      size={8}
                    />{" "}
                    <span style={{ fontSize: "0.8rem" }}>= {formatCents(variantPrice(product, v), product.currency)}</span>
                  </td>
                  <td>
                    <input form={formId} name="active" type="checkbox" defaultChecked={v.active} aria-label="Active" />
                  </td>
                  <td>
                    <form id={formId} action={update}>
                      <button type="submit">Save</button>
                    </form>
                  </td>
                  <td style={{ display: "flex", gap: "0.25rem" }}>
                    <form action={up}>
                      <button type="submit" disabled={i === 0} aria-label="Move up">
                        ↑
                      </button>
                    </form>
                    <form action={down}>
                      <button type="submit" disabled={i === variants.length - 1} aria-label="Move down">
                        ↓
                      </button>
                    </form>
                    <form action={remove}>
                      <button type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>Add a variant</h3>
      <form action={addVariant} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input name="name" type="text" placeholder="Name, e.g. 8x10" required />
        <input name="sku" type="text" placeholder="SKU (optional)" />
        <input name="price" type="text" inputMode="decimal" placeholder="Price (blank = product)" />
        <button type="submit">Add variant</button>
      </form>

      <h2>What clients can buy</h2>
      {options.length === 0 ? (
        <p>
          Nothing. {product.active ? "Every variant is inactive." : "This product is inactive."}
        </p>
      ) : (
        <ul>
          {options.map((o) => (
            <li key={o.variantId ?? "product"}>
              {o.label ?? product.name}: {formatCents(o.priceCents, product.currency)}
            </li>
          ))}
        </ul>
      )}

      <h2>Danger zone</h2>
      <form action={deleteThis}>
        <ConfirmButton message="Delete this product?">Delete product</ConfirmButton>
      </form>
    </main>
  );
}
