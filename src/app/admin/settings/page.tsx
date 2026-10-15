import { ThemePicker } from "./theme-picker";
import { BrandImageUpload } from "./brand-upload";
import { removeBrandImage, updateBrand } from "./brand-actions";
import { brandImageUrl, getBrand, type BrandImageKind } from "@/lib/brand/brand";

export const dynamic = "force-dynamic";

const IMAGES: { kind: BrandImageKind; name: string; hint: string; accept: string }[] = [
  { kind: "logo", name: "Logo", hint: "On client pages and at the top of every email. PNG or SVG, transparent background.", accept: "image/png,image/svg+xml,image/webp,image/jpeg" },
  { kind: "cover_logo", name: "Light logo", hint: "A white or light version for gallery covers over photos.", accept: "image/png,image/svg+xml,image/webp" },
  { kind: "default_cover", name: "Default cover", hint: "Used on a gallery before you pick its own cover.", accept: "image/jpeg,image/png,image/webp" },
];

export default async function SettingsPage() {
  const brand = await getBrand();
  const urls = Object.fromEntries(await Promise.all(IMAGES.map(async (i) => [i.kind, await brandImageUrl(brand, i.kind)] as const)));

  return (
    <main>
      <div className="pagehead">
        <h1>Settings</h1>
      </div>

      <h2 style={{ marginTop: 0 }}>Brand</h2>
      <p className="muted">What clients see on galleries, booking, invoices, contracts and emails. Your admin look below stays separate.</p>

      <ul className="ws-rows brand-images">
        {IMAGES.map((img) => (
          <li key={img.kind}>
            <span className="brand-thumb">{urls[img.kind] ? <img src={urls[img.kind] as string} alt="" /> : <span aria-hidden="true" />}</span>
            <span className="grow">
              <strong>{img.name}</strong>
              <span className="muted small"> · {img.hint}</span>
            </span>
            <BrandImageUpload kind={img.kind} accept={img.accept} />
            {urls[img.kind] && (
              <form action={removeBrandImage.bind(null, img.kind)}>
                <button type="submit" className="ghost sm">
                  Remove
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form action={updateBrand} className="brand-form">
        <div>
          <label htmlFor="business_name">Business name</label>
          <input id="business_name" name="business_name" type="text" required maxLength={120} defaultValue={brand.businessName} />
        </div>
        <div>
          <label>
            <input type="checkbox" name="use_accent" defaultChecked={brand.accent !== null} /> Use my own accent color on client pages
          </label>
          <input name="accent_color" type="color" defaultValue={brand.accent ?? "#2f4b63"} aria-label="Accent color" />
        </div>
        <div>
          <label htmlFor="reply_to_email">Replies go to</label>
          <input id="reply_to_email" name="reply_to_email" type="email" maxLength={254} defaultValue={brand.replyTo ?? ""} placeholder="you@gmail.com" />
        </div>
        <div>
          <label htmlFor="footer_text">Email footer (optional)</label>
          <input id="footer_text" name="footer_text" type="text" maxLength={300} defaultValue={brand.footer ?? ""} placeholder="David Monroe Photography · Savannah, Georgia" />
        </div>
        <button type="submit" className="primary">
          Save brand
        </button>
      </form>

      <h2>Appearance</h2>
      <p className="muted">How Proofer looks to you. Changes apply right away.</p>
      <ThemePicker />
    </main>
  );
}
