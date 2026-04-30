// Hand-rolled Database types matching supabase/migrations/0001_init.sql.
// After Phase 6 ships and the Supabase CLI is wired up, this file will be
// replaced by `supabase gen types typescript`. For now, it is hand-maintained
// so downstream code can compile before the Supabase project exists.
//
// NOTE: every table must declare `Relationships: []` (or actual FK relations)
// so `@supabase/supabase-js` generics (`GenericTable.Relationships: GenericRelationship[]`)
// narrow correctly in `.from(...).select(...)`. Without this, select results
// fall back to `never` and downstream property access fails typecheck.

export type Plan = "starter" | "premium" | "enterprise";
export type UserRole = "lojista" | "admin";
export type WishlistStatus = "active" | "paused" | "archived";
export type KycStatus = "pending" | "submitted" | "verified" | "rejected" | "expired";
export type TipoOperacao = "loja_fisica" | "patio" | "home_office" | "consignacao" | "investidor";
export type VolumeMensal = "1-5" | "6-15" | "16-30" | "30+";
export type KycDocType =
  | "rg_frente"
  | "rg_verso"
  | "cnh_frente"
  | "cnh_verso"
  | "selfie"
  | "comprovante"
  | "contrato_social";
export type ListingStatus = "active" | "removed" | "stale";
export type SellerType = "PF" | "PJ";
export type OpportunityStatus =
  | "pending"
  | "initiating"
  | "negotiating"
  | "converged"
  | "lost"
  | "escalated"
  | "assumed"
  | "expired";
export type AgentThreadStatus =
  | "initiating"
  | "awaiting_pf_response"
  | "awaiting_agent_response"
  | "converged"
  | "lost"
  | "escalated";
export type AgentMessageDirection = "inbound" | "outbound";
export type BotAccountStatus = "warming" | "active" | "shadow_banned" | "dead";
export type OutboxStatus = "queued" | "sending" | "sent" | "failed" | "dead_lettered";
export type ScrapeRunStatus = "running" | "completed" | "failed";
export type DealStatus =
  | "contract_pending"
  | "signed"
  | "inspection"
  | "transferring"
  | "finalized"
  | "canceled";
export type FuelType = "flex" | "gasolina" | "diesel" | "híbrido" | "elétrico";
export type Transmission = "automático" | "manual" | "CVT";

export type Tables = {
  users: {
    Row: {
      id: string;
      email: string;
      name: string | null;
      company_name: string | null;
      cnpj: string | null;
      cnpj_razao_social: string | null;
      cnpj_situacao: string | null;
      cnpj_cnae: string | null;
      phone: string | null;
      phone_verified: boolean;
      tipo_operacao: TipoOperacao | null;
      volume_mensal: VolumeMensal | null;
      lead_source: string | null;
      plan: Plan;
      role: UserRole;
      onboarding_complete: boolean;
      kyc_status: KycStatus;
      kyc_submitted_at: string | null;
      kyc_verified_at: string | null;
      kyc_rejection_reason: string | null;
      kyc_provider_ref: string | null;
      kyc_expires_at: string | null;
      city: string | null;
      uf: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id: string;
      email: string;
      name?: string | null;
      company_name?: string | null;
      cnpj?: string | null;
      cnpj_razao_social?: string | null;
      cnpj_situacao?: string | null;
      cnpj_cnae?: string | null;
      phone?: string | null;
      phone_verified?: boolean;
      tipo_operacao?: TipoOperacao | null;
      volume_mensal?: VolumeMensal | null;
      lead_source?: string | null;
      plan?: Plan;
      role?: UserRole;
      onboarding_complete?: boolean;
      kyc_status?: KycStatus;
      kyc_submitted_at?: string | null;
      kyc_verified_at?: string | null;
      kyc_rejection_reason?: string | null;
      kyc_provider_ref?: string | null;
      kyc_expires_at?: string | null;
      city?: string | null;
      uf?: string | null;
    };
    Update: Partial<Tables["users"]["Insert"]>;
    Relationships: [];
  };

  wishlists: {
    Row: {
      id: string;
      user_id: string;
      name: string;
      brand: string;
      model: string;
      trim: string | null;
      year_min: number | null;
      year_max: number | null;
      km_max: number | null;
      price_max: number | null;
      fuel_type: string[];
      transmission: string[];
      armored: boolean | null;
      region_uf: string[];
      region_cities: string[];
      status: WishlistStatus;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      name: string;
      brand: string;
      model: string;
      trim?: string | null;
      year_min?: number | null;
      year_max?: number | null;
      km_max?: number | null;
      price_max?: number | null;
      fuel_type?: string[];
      transmission?: string[];
      armored?: boolean | null;
      region_uf?: string[];
      region_cities?: string[];
      status?: WishlistStatus;
    };
    Update: Partial<Tables["wishlists"]["Insert"]>;
    Relationships: [];
  };

  listings: {
    Row: {
      id: string;
      source: string;
      source_listing_id: string;
      fingerprint: string;
      brand: string | null;
      model: string | null;
      trim: string | null;
      year: number | null;
      km: number | null;
      price: number | null;
      fipe: number | null;
      savings_vs_fipe: number | null;
      savings_pct: number | null;
      seller_type: SellerType | null;
      seller_location: string | null;
      seller_uf: string | null;
      seller_city: string | null;
      listing_url: string | null;
      photo_url: string | null;
      days_online: number | null;
      reductions: number | null;
      attributes: Record<string, unknown>;
      motivation_signals: Record<string, unknown>;
      first_seen_at: string;
      last_scraped_at: string;
      status: ListingStatus;
      created_at: string;
      updated_at: string;
    };
    Insert: Omit<
      Tables["listings"]["Row"],
      "id" | "created_at" | "updated_at" | "first_seen_at" | "last_scraped_at"
    > & {
      first_seen_at?: string;
      last_scraped_at?: string;
    };
    Update: Partial<Tables["listings"]["Insert"]>;
    Relationships: [];
  };

  opportunities: {
    Row: {
      id: string;
      user_id: string;
      wishlist_id: string;
      listing_id: string;
      match_score: number | null;
      status: OpportunityStatus;
      fee_amount: number | null;
      agent_thread_id: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      wishlist_id: string;
      listing_id: string;
      match_score?: number | null;
      status?: OpportunityStatus;
      fee_amount?: number | null;
      agent_thread_id?: string | null;
    };
    Update: Partial<Tables["opportunities"]["Insert"]>;
    Relationships: [];
  };

  agent_threads: {
    Row: {
      id: string;
      opportunity_id: string | null;
      bot_account_id: string | null;
      webmotors_thread_url: string | null;
      status: AgentThreadStatus;
      round: number;
      first_message_sent_at: string | null;
      last_pf_message_at: string | null;
      last_agent_message_at: string | null;
      converged_at: string | null;
      target_price: number | null;
      current_offer: number | null;
      pf_name: string | null;
      pf_phone: string | null;
      escalation_reason: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<Omit<Tables["agent_threads"]["Row"], "id" | "created_at" | "updated_at">>;
    Update: Partial<Tables["agent_threads"]["Insert"]>;
    Relationships: [];
  };

  agent_messages: {
    Row: {
      id: string;
      thread_id: string;
      direction: AgentMessageDirection;
      body: string;
      model: string | null;
      prompt_version: string | null;
      sent_at: string | null;
      received_at: string | null;
      webmotors_message_id: string | null;
      created_at: string;
    };
    Insert: {
      thread_id: string;
      direction: AgentMessageDirection;
      body: string;
      model?: string | null;
      prompt_version?: string | null;
      sent_at?: string | null;
      received_at?: string | null;
      webmotors_message_id?: string | null;
    };
    Update: Partial<Tables["agent_messages"]["Insert"]>;
    Relationships: [];
  };

  bot_accounts: {
    Row: {
      id: string;
      source: string;
      email: string;
      encrypted_password: string;
      status: BotAccountStatus;
      messages_sent_today: number;
      messages_sent_total: number;
      last_used_at: string | null;
      max_daily_messages: number;
      cooldown_until: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Omit<Tables["bot_accounts"]["Row"], "id" | "created_at" | "updated_at">;
    Update: Partial<Tables["bot_accounts"]["Insert"]>;
    Relationships: [];
  };

  pending_outbox: {
    Row: {
      id: string;
      thread_id: string;
      body: string;
      scheduled_for: string;
      attempts: number;
      last_error: string | null;
      status: OutboxStatus;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      thread_id: string;
      body: string;
      scheduled_for?: string;
      attempts?: number;
      last_error?: string | null;
      status?: OutboxStatus;
    };
    Update: Partial<Tables["pending_outbox"]["Insert"]>;
    Relationships: [];
  };

  scrape_runs: {
    Row: {
      id: string;
      source: string;
      started_at: string;
      ended_at: string | null;
      status: ScrapeRunStatus;
      apify_run_id: string | null;
      cost_usd: number | null;
      listings_new: number;
      listings_updated: number;
      listings_error: number;
      notes: string | null;
      created_at: string;
    };
    Insert: Partial<Omit<Tables["scrape_runs"]["Row"], "id" | "created_at">>;
    Update: Partial<Tables["scrape_runs"]["Insert"]>;
    Relationships: [];
  };

  deals: {
    Row: {
      id: string;
      user_id: string;
      opportunity_id: string | null;
      status: DealStatus;
      fee_paid_amount: number | null;
      stripe_charge_id: string | null;
      contract_url: string | null;
      zapsign_document_id: string | null;
      seller_contact_shared_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      opportunity_id?: string | null;
      status?: DealStatus;
      fee_paid_amount?: number | null;
      stripe_charge_id?: string | null;
      contract_url?: string | null;
      zapsign_document_id?: string | null;
      seller_contact_shared_at?: string | null;
    };
    Update: Partial<Tables["deals"]["Insert"]>;
    Relationships: [];
  };

  subscriptions: {
    Row: {
      id: string;
      user_id: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      tier: Plan;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
      tier?: Plan;
      current_period_end?: string | null;
      cancel_at_period_end?: boolean;
    };
    Update: Partial<Tables["subscriptions"]["Insert"]>;
    Relationships: [];
  };

  kyc_documents: {
    Row: {
      id: string;
      user_id: string;
      doc_type: KycDocType;
      storage_path: string;
      ocr_data: Record<string, unknown>;
      verified: boolean;
      created_at: string;
    };
    Insert: {
      user_id: string;
      doc_type: KycDocType;
      storage_path: string;
      ocr_data?: Record<string, unknown>;
      verified?: boolean;
    };
    Update: Partial<Tables["kyc_documents"]["Insert"]>;
    Relationships: [];
  };

  opt_out_list: {
    Row: {
      id: string;
      phone_hash: string | null;
      webmotors_user_id: string | null;
      reason: string | null;
      opted_out_at: string;
    };
    Insert: {
      phone_hash?: string | null;
      webmotors_user_id?: string | null;
      reason?: string | null;
    };
    Update: Partial<Tables["opt_out_list"]["Insert"]>;
    Relationships: [];
  };
};

export type Database = {
  public: {
    Tables: Tables;
    Views: {
      opportunities_enriched: {
        Row: Tables["opportunities"]["Row"] & {
          listing_brand: string | null;
          listing_model: string | null;
          listing_year: number | null;
          listing_km: number | null;
          listing_price: number | null;
          listing_fipe: number | null;
          savings_pct: number | null;
          photo_url: string | null;
          listing_url: string | null;
          seller_city: string | null;
          seller_uf: string | null;
          wishlist_name: string;
          thread_status: AgentThreadStatus | null;
          thread_round: number | null;
          last_pf_message_at: string | null;
          last_agent_message_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};

// Convenience type aliases — pull row types out by table name.
export type DbUser = Tables["users"]["Row"];
export type DbWishlist = Tables["wishlists"]["Row"];
export type DbListing = Tables["listings"]["Row"];
export type DbOpportunity = Tables["opportunities"]["Row"];
export type DbAgentThread = Tables["agent_threads"]["Row"];
export type DbAgentMessage = Tables["agent_messages"]["Row"];
export type DbBotAccount = Tables["bot_accounts"]["Row"];
export type DbOutboxItem = Tables["pending_outbox"]["Row"];
export type DbScrapeRun = Tables["scrape_runs"]["Row"];
export type DbDeal = Tables["deals"]["Row"];
export type DbSubscription = Tables["subscriptions"]["Row"];
export type DbKycDocument = Tables["kyc_documents"]["Row"];
export type DbOpportunityEnriched = Database["public"]["Views"]["opportunities_enriched"]["Row"];
