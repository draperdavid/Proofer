export type ProductCategory = {
  id: string;
  name: string;
  position: number;
  created_at: string;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string;
  fulfillment: "self";
  requires_shipping: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price_cents: number | null;
  active: boolean;
  position: number;
  created_at: string;
};
