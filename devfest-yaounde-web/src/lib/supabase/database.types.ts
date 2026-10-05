export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target?: string | null
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          active: boolean
          applies_to: string
          code: string
          expires_at: string | null
          kind: string
          max_redemptions: number | null
          redeemed_count: number
          value: number
        }
        Insert: {
          active?: boolean
          applies_to?: string
          code: string
          expires_at?: string | null
          kind: string
          max_redemptions?: number | null
          redeemed_count?: number
          value: number
        }
        Update: {
          active?: boolean
          applies_to?: string
          code?: string
          expires_at?: string | null
          kind?: string
          max_redemptions?: number | null
          redeemed_count?: number
          value?: number
        }
        Relationships: []
      }
      dp_card_reports: {
        Row: {
          card_id: string
          created_at: string
          id: string
          reporter_ip: unknown
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          reporter_ip?: unknown
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          reporter_ip?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "dp_card_reports_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "dp_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_cards: {
        Row: {
          consent: boolean
          consent_at: string
          consent_text: string
          created_at: string
          deletion_hash: string
          id: string
          locale: string
          nickname: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          submitter_ip: unknown
          theme: string
          visible: boolean
        }
        Insert: {
          consent?: boolean
          consent_at: string
          consent_text: string
          created_at?: string
          deletion_hash: string
          id?: string
          locale: string
          nickname: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          submitter_ip?: unknown
          theme?: string
          visible?: boolean
        }
        Update: {
          consent?: boolean
          consent_at?: string
          consent_text?: string
          created_at?: string
          deletion_hash?: string
          id?: string
          locale?: string
          nickname?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          submitter_ip?: unknown
          theme?: string
          visible?: boolean
        }
        Relationships: []
      }
      editorial_documents: {
        Row: {
          id: string
          payload: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id: string
          payload: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          payload?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      editorial_migration_backup: {
        Row: {
          document_id: string
          migration: string
          payload: Json
          taken_at: string
        }
        Insert: {
          document_id: string
          migration: string
          payload: Json
          taken_at?: string
        }
        Update: {
          document_id?: string
          migration?: string
          payload?: Json
          taken_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          name_snapshot: Json
          order_id: string
          product_id: string
          quantity: number
          unit_amount: number
          variant: Json | null
        }
        Insert: {
          id?: string
          name_snapshot: Json
          order_id: string
          product_id: string
          quantity: number
          unit_amount: number
          variant?: Json | null
        }
        Update: {
          id?: string
          name_snapshot?: Json
          order_id?: string
          product_id?: string
          quantity?: number
          unit_amount?: number
          variant?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          deposit_id: string
          fulfilment: Json | null
          id: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deposit_id: string
          fulfilment?: Json | null
          id?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          deposit_id?: string
          fulfilment?: Json | null
          id?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: true
            referencedRelation: "payment_intents"
            referencedColumns: ["deposit_id"]
          },
        ]
      }
      organisers: {
        Row: {
          added_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          deposit_id: string | null
          detail: Json | null
          event: string
          id: number
        }
        Insert: {
          created_at?: string
          deposit_id?: string | null
          detail?: Json | null
          event: string
          id?: number
        }
        Update: {
          created_at?: string
          deposit_id?: string | null
          detail?: Json | null
          event?: string
          id?: number
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          activated_at: string | null
          attendees: Json | null
          charged_amount: number
          contact: Json
          created_at: string
          currency: string
          deposit_id: string
          discount_amount: number
          discount_code: string | null
          failure_code: string | null
          fulfilment: Json | null
          kind: Database["public"]["Enums"]["payment_kind"]
          line_items: Json
          locale: string
          net_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          terms_accepted_at: string | null
          terms_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          attendees?: Json | null
          charged_amount: number
          contact: Json
          created_at?: string
          currency?: string
          deposit_id: string
          discount_amount?: number
          discount_code?: string | null
          failure_code?: string | null
          fulfilment?: Json | null
          kind: Database["public"]["Enums"]["payment_kind"]
          line_items: Json
          locale?: string
          net_amount: number
          status?: Database["public"]["Enums"]["payment_status"]
          terms_accepted_at?: string | null
          terms_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          attendees?: Json | null
          charged_amount?: number
          contact?: Json
          created_at?: string
          currency?: string
          deposit_id?: string
          discount_amount?: number
          discount_code?: string | null
          failure_code?: string | null
          fulfilment?: Json | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          line_items?: Json
          locale?: string
          net_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          terms_accepted_at?: string | null
          terms_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identifier: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          notes: string | null
          reason: string
          reference: string
          requester_email: string
          requester_name: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          notes?: string | null
          reason: string
          reference: string
          requester_email: string
          requester_name: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          notes?: string | null
          reason?: string
          reference?: string
          requester_email?: string
          requester_name?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          announcement: Json | null
          bevy_url: string | null
          capacity: Json | null
          cfs: Json | null
          event_date: string | null
          hero: Json | null
          id: string
          legal: Json | null
          memory_lane: Json | null
          nav: Json | null
          sponsor_call: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          announcement?: Json | null
          bevy_url?: string | null
          capacity?: Json | null
          cfs?: Json | null
          event_date?: string | null
          hero?: Json | null
          id?: string
          legal?: Json | null
          memory_lane?: Json | null
          nav?: Json | null
          sponsor_call?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          announcement?: Json | null
          bevy_url?: string | null
          capacity?: Json | null
          cfs?: Json | null
          event_date?: string | null
          hero?: Json | null
          id?: string
          legal?: Json | null
          memory_lane?: Json | null
          nav?: Json | null
          sponsor_call?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          apparel_size: string | null
          attendee_email: string
          attendee_name: string
          badge_code: string
          checked_in_at: string | null
          claimed_at: string | null
          created_at: string
          deposit_id: string
          id: string
          is_self: boolean
          tier_id: string
          user_id: string
        }
        Insert: {
          apparel_size?: string | null
          attendee_email: string
          attendee_name: string
          badge_code: string
          checked_in_at?: string | null
          claimed_at?: string | null
          created_at?: string
          deposit_id: string
          id?: string
          is_self?: boolean
          tier_id: string
          user_id: string
        }
        Update: {
          apparel_size?: string | null
          attendee_email?: string
          attendee_name?: string
          badge_code?: string
          checked_in_at?: string | null
          claimed_at?: string | null
          created_at?: string
          deposit_id?: string
          id?: string
          is_self?: boolean
          tier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["deposit_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_paid_deposit: {
        Args: { p_badge_codes?: string[]; p_deposit_id: string }
        Returns: string
      }
      bump_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_window_seconds: number
        }
        Returns: number
      }
      check_in_ticket: { Args: { p_badge_code: string }; Returns: Json }
      claim_ticket: {
        Args: { p_new_user_id: string; p_ticket_id: string }
        Returns: Json
      }
      cleanup_rate_limits: {
        Args: { p_older_than_seconds?: number }
        Returns: number
      }
      create_payment_intent: {
        Args: {
          p_attendees: Json
          p_charged_amount: number
          p_contact: Json
          p_currency: string
          p_deposit_id: string
          p_discount_amount: number
          p_discount_code: string
          p_fulfilment?: Json
          p_kind: Database["public"]["Enums"]["payment_kind"]
          p_line_items: Json
          p_locale: string
          p_net_amount: number
          p_reservation_window?: number
          p_terms_text?: string
          p_tier_capacities?: Json
          p_user_id: string
          p_variant_capacities?: Json
        }
        Returns: string
      }
      expire_stale_intents: {
        Args: { p_older_than_seconds?: number }
        Returns: number
      }
      get_vault_secret: { Args: { p_name: string }; Returns: string }
      invoke_cleanup_sweep: { Args: never; Returns: number }
      is_organiser: { Args: { p_user_id?: string }; Returns: boolean }
      set_organiser_role: {
        Args: {
          p_action: string
          p_actor: string
          p_confirm_self?: boolean
          p_target: string
        }
        Returns: string
      }
      variant_taken: {
        Args: {
          p_color: string
          p_product_id: string
          p_reservation_window?: number
          p_size: string
        }
        Returns: number
      }
    }
    Enums: {
      order_status:
        | "processing"
        | "ready_for_pickup"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_kind: "tickets" | "shop"
      payment_status: "pending" | "activated" | "amount_mismatch" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: [
        "processing",
        "ready_for_pickup",
        "shipped",
        "delivered",
        "cancelled",
      ],
      payment_kind: ["tickets", "shop"],
      payment_status: ["pending", "activated", "amount_mismatch", "failed"],
    },
  },
} as const
