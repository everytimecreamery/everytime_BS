/**
 * Everytime Creamery — Core Type Definitions
 * Phase 0: Foundation & Architecture
 */

export type PortalType = 'staff' | 'owner';

export interface BrandColorConfig {
  cream: string;
  white: string;
  primaryRed: string;
  darkText: string;
  mutedText: string;
}

export type GelatoCupSize = 'piccolo' | 'medio' | 'grande';

export type PaymentMethodType = 'cash' | 'card' | 'upi_qr';

export type OrderStatus = 'pending' | 'in_prep' | 'completed' | 'cancelled';

export interface OwnerNavItem {
  id: string;
  label: string;
  iconName: string;
  href: string;
  badge?: string;
  description: string;
}

export interface SystemStatus {
  portal: PortalType;
  environment: 'development' | 'production' | 'test';
  version: string;
  phase: string;
  isBackendConnected: boolean;
}

