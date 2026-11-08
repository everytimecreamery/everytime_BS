'use client';

import React from 'react';
import {
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Users,
  FileSpreadsheet,
  Layers,
  Settings2,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface OwnerSectionViewProps {
  sectionId: string;
}

export function OwnerSectionView({ sectionId }: OwnerSectionViewProps) {
  switch (sectionId) {
    case 'sales':
      return <SalesPlaceholder />;
    case 'reports':
      return <ReportsPlaceholder />;
    case 'menu':
      return <MenuManagementPlaceholder />;
    case 'staff-management':
      return <StaffManagementPlaceholder />;
    case 'settings':
      return <SettingsPlaceholder />;
    case 'dashboard':
    default:
      return <DashboardPlaceholder />;
  }
}

function DashboardPlaceholder() {
  const metricCards = [
    { title: 'Gross Revenue (Today)', value: formatCurrency(0), hint: 'Pending transactions', icon: TrendingUp },
    { title: 'Completed Orders', value: '0', hint: 'Tokens closed today', icon: ShoppingBag },
    { title: 'Average Ticket Value', value: formatCurrency(0), hint: 'Per customer bill', icon: CreditCard },
    { title: 'Active Counter Staff', value: '1', hint: 'Shift Terminal #01', icon: Users },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#777777]">{card.title}</span>
                <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] flex items-center justify-center text-[#C43C1E]">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-[#222222] tabular-nums tracking-tight">
                  {card.value}
                </div>
                <div className="text-[11px] text-[#777777] mt-1 flex items-center gap-1">
                  <span>{card.hint}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Revenue Velocity & Live Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E8E3C3] p-6 shadow-xs flex flex-col justify-center items-center min-h-[300px] text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#C43C1E]/10 flex items-center justify-center text-[#C43C1E] mb-3">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#222222]">Hourly Sales Velocity Chart</h3>
          <p className="text-xs text-[#777777] max-w-md mt-1">
            Real-time sales curves, rush-hour peak analysis, and bucket breakdowns will populate in <strong>Phase 6 (Owner Portal)</strong>.
          </p>
          <div className="mt-4 px-3 py-1 rounded-full bg-[#FAF8E8] text-xs font-medium text-[#777777] border border-[#E8E3C3]">
            Telemetry Ready • Phase 0 Architecture
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E8E3C3] p-6 shadow-xs flex flex-col">
          <h3 className="text-sm font-bold text-[#222222] mb-3">Today’s Flavors in Well</h3>
          <div className="space-y-2 flex-1">
            {['Pistachio Bronte', 'Dark Chocolate 70%', 'Alphonso Mango Sorbet', 'Madagascar Vanilla'].map(
              (flavor, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs"
                >
                  <span className="font-semibold text-[#222222]">{flavor}</span>
                  <span className="text-[#777777]">Phase 2 Menu</span>
                </div>
              )
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-[#E8E3C3] text-[11px] text-[#777777] text-center">
            Tub lifecycle tracking scheduled for Phase 10
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <CreditCard className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Sales & Billing Transaction Feed</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        Granular transaction ledger, customer payment methods (Cash, Card, QR), tax breakdowns, and refund audits will be displayed here in <strong>Phase 6</strong>.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FAF8E8] text-xs text-[#222222] border border-[#E8E3C3]">
        <CheckCircle2 className="w-4 h-4 text-[#C43C1E]" />
        <span>Schema ready for Supabase transactions integration (Phase 7)</span>
      </div>
    </div>
  );
}

function ReportsPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <FileSpreadsheet className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Reports & Daily Z-Report</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        End-of-day register closure, expected cash vs actual counted cash audit, product mix breakdown, and printable Z-reports for store accounting.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Z-Report Daily Closure
        </span>
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Category Breakdown
        </span>
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Cash Drawer Audit
        </span>
      </div>
    </div>
  );
}

function MenuManagementPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <Layers className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Menu, Flavor & Pricing Management</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        Full CRUD manager for gelato flavors, tub sizes (Piccolo, Medio, Grande), takeaway packaging, seasonal specialties, and real-time counter availability toggles.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FAF8E8] text-xs text-[#222222] border border-[#E8E3C3]">
        <Sparkles className="w-4 h-4 text-[#C43C1E]" />
        <span>Menu configuration synchronizes directly with Staff POS in real time</span>
      </div>
    </div>
  );
}

function StaffManagementPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <Users className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Staff Accounts & Shift Controls</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        Manage counter scoopers, assign quick 4-digit terminal login PINs, manage opening/closing shift permissions, and track register ownership.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
        <Clock className="w-4 h-4 text-[#C43C1E]" />
        <span>Role-Based Access Control (RBAC) configured in Phase 7</span>
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <Settings2 className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Store Settings & Hardware Configuration</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        Store address details, GST/VAT tax rules, receipt header & footer messages, ESC/POS thermal printer pairing, and currency formatting.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Printer (80mm Thermal)
        </span>
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Tax Configuration
        </span>
        <span className="px-3 py-1 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          Token Numbering Reset
        </span>
      </div>
    </div>
  );
}

