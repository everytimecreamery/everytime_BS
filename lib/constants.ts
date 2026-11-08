/**
 * Everytime Creamery — System Constants & Brand Tokens
 * Phase 0: Project Foundation
 */

import { BrandColorConfig, OwnerNavItem } from '@/types';

export const BRAND_COLORS: BrandColorConfig = {
  cream: '#F9F7DC',
  white: '#FFFFFF',
  primaryRed: '#C43C1E',
  darkText: '#222222',
  mutedText: '#777777',
} as const;

export const APP_CONFIG = {
  name: 'Everytime Creamery',
  tagline: 'Artisan Gelato POS & Management',
  version: '0.1.0',
  currentPhase: 'Phase 1 — Staff POS Interface',
} as const;

export const ROUTES = {
  home: '/',
  staff: '/staff',
  owner: '/owner',
} as const;

export const OWNER_NAV_ITEMS: OwnerNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconName: 'LayoutDashboard',
    href: '/owner',
    description: 'Real-time sales velocity, order metrics, and daily overview.',
  },
  {
    id: 'sales',
    label: 'Sales',
    iconName: 'Receipt',
    href: '/owner#sales',
    description: 'Transaction feeds, payment breakdowns, and shift logs.',
  },
  {
    id: 'reports',
    label: 'Reports & Z-Report',
    iconName: 'BarChart3',
    href: '/owner#reports',
    description: 'Daily closure, cash audits, and category performance.',
  },
  {
    id: 'menu',
    label: 'Menu Management',
    iconName: 'IceCream',
    href: '/owner#menu',
    description: 'Flavors, cup/cone sizes, add-ons, and pricing rules.',
  },
  {
    id: 'staff-management',
    label: 'Staff Management',
    iconName: 'Users',
    href: '/owner#staff',
    description: 'Counter staff accounts, PINs, and shift monitoring.',
  },
  {
    id: 'settings',
    label: 'Settings',
    iconName: 'Settings',
    href: '/owner#settings',
    description: 'Tax rules, shop metadata, receipt layout, and hardware.',
  },
];

