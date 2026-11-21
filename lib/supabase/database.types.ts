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
          pin_hash?: string | null;
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
          created_at: string;
        };
        Insert: {
          id: string;
          label: string;
          icon_name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          icon_name?: string;
          sort_order?: number;
          is_active?: boolean;
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
          created_at: string;
        };
        Insert: {
          id: string;
          menu_item_id: string;
          label: string;
          price_paise: number;
          volume_ml?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          label?: string;
          price_paise?: number;
          volume_ml?: number | null;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          terminal_id: string;
          cashier_id: string;
          shift_id: string | null;
          token_terminal: string;
          token_seq: number;
          status: 'COMPLETED';
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
        };
        Insert: {
          id: string;
          store_id: string;
          terminal_id: string;
          cashier_id: string;
          shift_id?: string | null;
          token_terminal: string;
          token_seq: number;
          status?: 'COMPLETED';
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
        };
        Update: {
          id?: string;
          store_id?: string;
          terminal_id?: string;
          cashier_id?: string;
          shift_id?: string | null;
          token_terminal?: string;
          token_seq?: number;
          status?: 'COMPLETED';
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
  };
}
