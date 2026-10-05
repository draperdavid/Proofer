import type { Variants } from "@/lib/galleries/variants";
import type { Visibility } from "@/lib/galleries/access";

export type Collection = {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  status: "draft" | "published";
  visibility: Visibility;
  password_hash: string | null;
  access_version: number;
  created_at: string;
  updated_at: string;
};

export type PhotoSet = {
  id: string;
  collection_id: string;
  name: string;
  position: number;
};

export type MediaAsset = {
  id: string;
  collection_id: string;
  set_id: string;
  kind: "photo";
  r2_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: "pending" | "uploaded";
  position: number;
  created_at: string;
  variants: Variants;
  variants_ready: boolean;
  variant_attempts: number;
  variant_error: string | null;
};
