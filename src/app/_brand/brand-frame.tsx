// Client-facing brand pieces (Phase 9.2), used on every client page: a header
// with the logo (or business name), the accent color for that page, and a
// footer. Admin pages never include these, so the admin themes are untouched.
import { brandImageUrl, getBrand } from "@/lib/brand/brand";

// Sets the page's accent (buttons, links) to the brand color, when one is set.
// The value is validated hex (brand.ts), so it's safe inside the style tag.
export async function BrandAccent() {
  const brand = await getBrand();
  if (!brand.accent || !brand.accentInk) return null;
  return <style>{`:root{--acc:${brand.accent};--acc-ink:${brand.accentInk};--acc-line:${brand.accent}66;--acc-soft:${brand.accent}1a}`}</style>;
}

export async function BrandHeader() {
  const brand = await getBrand();
  const logo = await brandImageUrl(brand, "logo");
  return (
    <>
      <BrandAccent />
      <header className="brand-head">
        {logo ? <img src={logo} alt={brand.businessName} className="brand-logo" /> : <span className="brand-name">{brand.businessName}</span>}
      </header>
    </>
  );
}

export async function BrandFooter() {
  const brand = await getBrand();
  return (
    <footer className="brand-foot">
      <span>{brand.footer ?? brand.businessName}</span>
    </footer>
  );
}
