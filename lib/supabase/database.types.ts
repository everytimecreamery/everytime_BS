export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          gstin: string | null;
          currency: string;
          business_day_cutoff_hour: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          gstin?: string | null;
          currency?: string;
          business_day_cutoff_hour?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          gstin?: string | null;
          currency?: string;
          business_day_cutoff_hour?: number;
          created_at?: string;
        };
      };
      terminals: {
        Row: {
          id: string;
          store_id: string;
          terminal_number: string;
          device_name: string | null;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          terminal_number?: string;
          device_name?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          terminal_number?: string;
          device_name?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          store_id: string | null;
          role: 'staff' | 'owner';
          full_name: string;
          cashier_code: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          deactivated_by: string | null;
          pin_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          store_id?: string | null;
          role?: 'staff' | 'owner';
          full_name: string;
          cashier_code?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          pin_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          role?: 'staff' | 'owner';
          full_name?: string;
          cashier_code?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          pin_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      staff_invitations: {
        Row: {
          id: string;
          email: string;
          store_id: string;
          full_name: string;
          cashier_code: string | null;
          role: 'staff';
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          superseded_at: string | null;
          accepted_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          store_id: string;
          full_name: string;
          cashier_code?: string | null;
          role?: 'staff';
          invited_by: string;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          superseded_at?: string | null;
          accepted_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          store_id?: string;
          full_name?: string;
          cashier_code?: string | null;
          role?: 'staff';
          invited_by?: string;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          superseded_at?: string | null;
          accepted_user_id?: string | null;
          created_at?: string;
        };
      };
      staff_members: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          store_id: string;
          cashier_code: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          store_id: string;
          cashier_code: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          store_id?: string;
          cashier_code?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      shifts: {
        Row: {
          id: string;
          store_id: string;
          cashier_id: string;
          terminal_id: string;
          started_at: string;
          ended_at: string | null;
          opening_float_paise: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          cashier_id: string;
          terminal_id: string;
          started_at?: string;
          ended_at?: string | null;
          opening_float_paise?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          cashier_id?: string;
          terminal_id?: string;
          started_at?: string;
          ended_at?: string | null;
          opening_float_paise?: number;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          label: string;
          icon_name: string;
          sort_order: number;
          is_active: boolean;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          label: string;
          icon_name: string;
          sort_order?: number;
          is_active?: boolean;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          icon_name?: string;
          sort_order?: number;
          is_active?: boolean;
          is_archived?: boolean;
          created_at?: string;
        };
      };
      menu_items: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          base_price_paise: number;
          interaction_type: string;
          is_available: boolean;
          is_archived: boolean;
          is_frequent: boolean;
          portion_grams: number;
          is_premium: boolean;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          category_id: string;
          name: string;
          base_price_paise: number;
          interaction_type?: string;
          is_available?: boolean;
          is_archived?: boolean;
          is_frequent?: boolean;
          portion_grams?: number;
          is_premium?: boolean;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          base_price_paise?: number;
          interaction_type?: string;
          is_available?: boolean;
          is_archived?: boolean;
          is_frequent?: boolean;
          portion_grams?: number;
          is_premium?: boolean;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
      };
      menu_variants: {
        Row: {
          id: string;
          menu_item_id: string;
          label: string;
          price_paise: number;
          volume_ml: number | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          menu_item_id: string;
          label: string;
          price_paise: number;
          volume_ml?: number | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          label?: string;
          price_paise?: number;
          volume_ml?: number | null;
          is_archived?: boolean;
          created_at?: string;
        };
      };
      menu_addons: {
        Row: {
          id: string;
          label: string;
          price_paise: number;
          category_id: string | null;
          is_available: boolean;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          label: string;
          price_paise: number;
          category_id?: string | null;
          is_available?: boolean;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          price_paise?: number;
          category_id?: string | null;
          is_available?: boolean;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          terminal_id: string;
          cashier_id: string;
          billing_session_id: string | null;
          staff_member_id: string | null;
          shift_id: string | null;
          token_terminal: string;
          token_seq: number;
          status: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'VOID';
          subtotal_paise: number;
          discount_paise: number;
          discount_type: string | null;
          discount_reason: string | null;
          discount_approved_by: string | null;
          tax_paise: number;
          cgst_paise: number;
          sgst_paise: number;
          total_paise: number;
          client_completed_at: string;
          server_received_at: string;
          business_date: string;
          cancelled_reason: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
        };
        Insert: {
          id: string;
          store_id: string;
          terminal_id: string;
          cashier_id?: string | null;
          billing_session_id?: string | null;
          staff_member_id?: string | null;
          shift_id?: string | null;
          token_terminal: string;
          token_seq: number;
          status?: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'VOID';
          subtotal_paise: number;
          discount_paise?: number;
          discount_type?: string | null;
          discount_reason?: string | null;
          discount_approved_by?: string | null;
          tax_paise?: number;
          cgst_paise?: number;
          sgst_paise?: number;
          total_paise: number;
          client_completed_at: string;
          server_received_at?: string;
          business_date: string;
          cancelled_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          terminal_id?: string;
          cashier_id?: string | null;
          billing_session_id?: string | null;
          staff_member_id?: string | null;
          shift_id?: string | null;
          token_terminal?: string;
          token_seq?: number;
          status?: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'VOID';
          subtotal_paise?: number;
          discount_paise?: number;
          discount_type?: string | null;
          discount_reason?: string | null;
          discount_approved_by?: string | null;
          tax_paise?: number;
          cgst_paise?: number;
          sgst_paise?: number;
          total_paise?: number;
          client_completed_at?: string;
          server_received_at?: string;
          business_date?: string;
          cancelled_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
        };
      };
      billing_sessions: {
        Row: {
          id: string;
          store_id: string;
          terminal_id: string;
          staff_member_id: string | null;
          started_at: string;
          stopped_at: string | null;
          started_by: string;
          stopped_by: string | null;
          status: 'ACTIVE' | 'STOPPED';
          stop_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          terminal_id: string;
          staff_member_id?: string | null;
          started_at?: string;
          stopped_at?: string | null;
          started_by: string;
          stopped_by?: string | null;
          status?: 'ACTIVE' | 'STOPPED';
          stop_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          terminal_id?: string;
          staff_member_id?: string | null;
          started_at?: string;
          stopped_at?: string | null;
          started_by?: string;
          stopped_by?: string | null;
          status?: 'ACTIVE' | 'STOPPED';
          stop_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      billing_session_events: {
        Row: {
          id: string;
          session_id: string;
          store_id: string;
          terminal_id: string;
          event_type: 'SESSION_STARTED' | 'SESSION_STOPPED';
          actor_id: string;
          staff_member_id: string | null;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          store_id: string;
          terminal_id: string;
          event_type: 'SESSION_STARTED' | 'SESSION_STOPPED';
          actor_id: string;
          staff_member_id?: string | null;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          store_id?: string;
          terminal_id?: string;
          event_type?: 'SESSION_STARTED' | 'SESSION_STOPPED';
          actor_id?: string;
          staff_member_id?: string | null;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string | null;
          product_name: string;
          variant_label: string | null;
          addon_label: string | null;
          quantity: number;
          unit_price_paise: number;
          addon_price_paise: number;
          total_price_paise: number;
        };
        Insert: {
          id: string;
          order_id: string;
          menu_item_id?: string | null;
          product_name: string;
          variant_label?: string | null;
          addon_label?: string | null;
          quantity: number;
          unit_price_paise: number;
          addon_price_paise?: number;
          total_price_paise: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          menu_item_id?: string | null;
          product_name?: string;
          variant_label?: string | null;
          addon_label?: string | null;
          quantity?: number;
          unit_price_paise?: number;
          addon_price_paise?: number;
          total_price_paise?: number;
        };
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          method: 'cash' | 'upi' | 'card';
          amount_paise: number;
          upi_utr: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          order_id: string;
          method: 'cash' | 'upi' | 'card';
          amount_paise: number;
          upi_utr?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          method?: 'cash' | 'upi' | 'card';
          amount_paise?: number;
          upi_utr?: string | null;
          created_at?: string;
        };
      };
      payment_corrections: {
        Row: {
          id: string;
          payment_id: string;
          order_id: string;
          previous_method: 'cash' | 'upi' | 'card';
          new_method: 'cash' | 'upi' | 'card';
          amount_paise: number;
          reason: string;
          corrected_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          order_id: string;
          previous_method: 'cash' | 'upi' | 'card';
          new_method: 'cash' | 'upi' | 'card';
          amount_paise: number;
          reason: string;
          corrected_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string;
          order_id?: string;
          previous_method?: 'cash' | 'upi' | 'card';
          new_method?: 'cash' | 'upi' | 'card';
          amount_paise?: number;
          reason?: string;
          corrected_by?: string;
          created_at?: string;
        };
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          reason: string;
          approved_by: string | null;
          refund_paise: number;
          method: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          reason: string;
          approved_by?: string | null;
          refund_paise: number;
          method: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          reason?: string;
          approved_by?: string | null;
          refund_paise?: number;
          method?: string;
          created_at?: string;
        };
      };
      z_reports: {
        Row: {
          id: string;
          store_id: string;
          cashier_id: string;
          shift_id: string | null;
          shift_date: string;
          gross_sales_paise: number;
          cash_collected_paise: number;
          upi_collected_paise: number;
          card_collected_paise: number;
          cash_discrepancy_paise: number;
          total_orders: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          cashier_id: string;
          shift_id?: string | null;
          shift_date: string;
          gross_sales_paise?: number;
          cash_collected_paise?: number;
          upi_collected_paise?: number;
          card_collected_paise?: number;
          cash_discrepancy_paise?: number;
          total_orders?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          cashier_id?: string;
          shift_id?: string | null;
          shift_date?: string;
          gross_sales_paise?: number;
          cash_collected_paise?: number;
          upi_collected_paise?: number;
          card_collected_paise?: number;
          cash_discrepancy_paise?: number;
          total_orders?: number;
          created_at?: string;
        };
      };
    };
    Functions: {
      complete_pos_checkout: {
        Args: {
          p_order_id: string;
          p_terminal_id?: string | null;
          p_token_terminal?: string;
          p_token_seq?: number | null;
          p_items: Json;
          p_discount_percent?: number;
          p_discount_type?: string | null;
          p_discount_reason?: string | null;
          p_payments: Json;
          p_client_completed_at?: string | null;
          p_business_date?: string | null;
          p_cashier_id?: string | null;
          p_expected_subtotal_paise?: number | null;
          p_expected_total_paise?: number | null;
          p_staff_member_id?: string | null;
        };
        Returns: Json;
      };
      start_billing_session: {
        Args: {
          p_store_id: string;
          p_terminal_id: string;
          p_staff_member_id?: string | null;
        };
        Returns: Json;
      };
      stop_billing_session: {
        Args: {
          p_session_id: string;
          p_stop_reason?: string | null;
        };
        Returns: Json;
      };
      get_active_billing_session: {
        Args: {
          p_terminal_id: string;
        };
        Returns: Json;
      };
      get_terminal_billing_status: {
        Args: {
          p_terminal_id?: string | null;
        };
        Returns: Json;
      };
      list_store_active_cashiers: {
        Args: {
          p_store_id?: string | null;
        };
        Returns: Json;
      };
      correct_payment_method: {
        Args: {
          p_payment_id: string;
          p_new_method: string;
          p_reason: string;
        };
        Returns: Database['public']['Tables']['payment_corrections']['Row'];
      };
    };
  };
}
