// Gallery Shop tab (Phase 7.2): products, then the cart. Plain forms posting
// to server actions, so it works without client JS. Prices shown here are
// for display; checkout re-prices every line from the database.
import { formatCents } from "@/app/admin/invoices/money";
import { sellableOptions } from "@/lib/store/catalog";
import type { PricedLine, StoreVariant } from "@/lib/store/cart";
import type { ShopProduct } from "@/lib/store/gallery-store";

const CART_MESSAGES: Record<string, string> = {
  added: "Added to your cart.",
  paid: "Thank you, your order went through. Stripe will email you a receipt.",
  empty: "Your cart is empty.",
  unavailable: "That item isn't available anymore.",
  "bad-item": "Please pick an option.",
  currency: "Those items can't be checked out together. Please check out separately.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  off: "The cart isn't available right now.",
};

export function Shop({
  products,
  variants,
  imageUrls,
  lines,
  message,
  addToCart,
  setCartQty,
  checkout,
}: {
  products: ShopProduct[];
  variants: StoreVariant[];
  imageUrls: Map<string, string>;
  lines: PricedLine[];
  message: string | undefined;
  addToCart: (formData: FormData) => Promise<void>;
  setCartQty: (formData: FormData) => Promise<void>;
  checkout: () => Promise<void>;
}) {
  const sellable = products
    .map((p) => ({
      product: p,
      options: sellableOptions(p, variants.filter((v) => v.product_id === p.id)).filter((o) => o.priceCents > 0),
    }))
    .filter((x) => x.options.length > 0);
  const total = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);
  const currency = lines[0]?.currency ?? "usd";

  return (
    <section>
      {message && CART_MESSAGES[message] && (
        <p role="status" className="notice">
          {CART_MESSAGES[message]}
        </p>
      )}

      {sellable.length === 0 ? (
        <p>Nothing is for sale right now.</p>
      ) : (
        <ul className="gcards">
          {sellable.map(({ product, options }) => (
            <li key={product.id}>
              <div className="gcard">
                {imageUrls.get(product.id) ? (
                  <img src={imageUrls.get(product.id)} alt="" loading="lazy" />
                ) : (
                  <div className="ph">{product.name}</div>
                )}
                <div className="meta">
                  <div className="title">{product.name}</div>
                  {product.description && <div className="sub">{product.description}</div>}
                  <form action={addToCart}>
                    <input type="hidden" name="product_id" value={product.id} />
                    {options.length === 1 && options[0].variantId === null ? (
                      <p>{formatCents(options[0].priceCents, product.currency)}</p>
                    ) : (
                      <select name="variant_id" required aria-label={`${product.name} option`}>
                        {options.map((o) => (
                          <option key={o.variantId ?? ""} value={o.variantId ?? ""}>
                            {o.label} · {formatCents(o.priceCents, product.currency)}
                          </option>
                        ))}
                      </select>
                    )}{" "}
                    <input type="number" name="qty" min={1} max={20} defaultValue={1} aria-label="Quantity" style={{ width: 64 }} />{" "}
                    <button type="submit">Add to cart</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Your cart</h2>
      {lines.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.productId}:${l.variantId ?? ""}`}>
                  <td>{l.label ? `${l.name} (${l.label})` : l.name}</td>
                  <td>{formatCents(l.unitCents, l.currency)}</td>
                  <td>
                    <form action={setCartQty} className="row">
                      <input type="hidden" name="product_id" value={l.productId} />
                      <input type="hidden" name="variant_id" value={l.variantId ?? ""} />
                      <input type="number" name="qty" min={0} max={20} defaultValue={l.qty} aria-label="Quantity" style={{ width: 64 }} />
                      <button type="submit">Update</button>
                    </form>
                  </td>
                  <td>{formatCents(l.unitCents * l.qty, l.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Subtotal <strong>{formatCents(total, currency)}</strong>. Shipping and tax, if any, are added at checkout.
          </p>
          <form action={checkout}>
            <button type="submit" className="primary">
              Check out
            </button>
          </form>
        </>
      )}
    </section>
  );
}
