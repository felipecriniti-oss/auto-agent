/**
 * WebMotors actor (ribtools/webmotors-scraper) dataset item shape.
 *
 * Verified against the actor's public readme example output.
 * All fields optional — the actor can skip fields if a listing doesn't expose them.
 *
 * Phase 8 owns this type; the on-demand route (Phase 5) and the webhook route
 * (Phase 7+8) both import from here.
 */
export interface WebMotorsScraped {
  id?: number;
  url?: string;
  title?: string;
  vehicle_type?: string;
  create_date?: string;
  publish_date?: string;
  make?: string;
  model?: string;
  version?: string;
  fabrication_year?: number;
  model_year?: number;
  km?: number;
  transmission?: string;
  fuel_type?: string;
  body_type?: string;
  final_plate?: string;
  is_armored?: boolean;
  price?: number;
  fipe_price?: number;
  color?: string;
  number_of_doors?: number;
  optionals?: string[];
  attributes?: string[];
  photos?: string[];
  view_360_url?: string;
  seller?: {
    id?: number;
    name?: string;
    cnpj?: string;
    phones?: string[];
    seller_type?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };
  // Tolerate unknown extra keys — defensive in case the actor adds fields.
  [key: string]: unknown;
}
