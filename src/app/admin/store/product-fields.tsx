import { centsToInput } from "@/lib/store/catalog";
import type { Product, ProductCategory } from "./types";

// Shared form fields for the new and edit product pages.
export function ProductFields({ product, categories }: { product?: Product; categories: ProductCategory[] }) {
  return (
    <>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required defaultValue={product?.name ?? ""} />
      </div>
      <div>
        <label htmlFor="slug">URL slug (blank = from name)</label>
        <input id="slug" name="slug" type="text" defaultValue={product?.slug ?? ""} />
      </div>
      <div>
        <label htmlFor="category_id">Category</label>
        <select id="category_id" name="category_id" defaultValue={product?.category_id ?? ""}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="price">Price, USD (variants without their own price use this)</label>
        <input
          id="price"
          name="price"
          type="text"
          inputMode="decimal"
          placeholder="25.00"
          defaultValue={product ? centsToInput(product.price_cents) : ""}
        />
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} defaultValue={product?.description ?? ""} />
      </div>
      <div>
        <label>
          <input name="requires_shipping" type="checkbox" defaultChecked={product?.requires_shipping ?? true} />{" "}
          Needs shipping
        </label>
      </div>
      <div>
        <label>
          <input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active (can be sold)
        </label>
      </div>
    </>
  );
}
