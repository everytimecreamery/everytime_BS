import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  Store,
  LayoutDashboard,
  Tablet,
  Monitor,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  FileCode2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F9F7DC] text-[#222222] flex flex-col font-sans selection:bg-[#C43C1E]/20">
      {/* Top Bar */}
      <header className="border-b border-[#E8E3C3] bg-white/80 backdrop-blur-xs py-4 px-6 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo size="md" />
          <StatusBadge label="Phase 0: Foundation" variant="brand" />
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16 flex flex-col items-center">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-semibold text-[#777777]">
            <span className="w-2 h-2 rounded-full bg-[#C43C1E]" />
            Gelato POS & Shop Management Platform
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#222222] tracking-tight">
            Everytime Creamery
          </h1>

          <p className="text-base sm:text-lg text-[#777777] leading-relaxed">
            Architected for high-velocity counter billing and unified back-office oversight. Select your operational portal below:
          </p>
        </div>

        {/* Portal Entry Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-10">
          {/* Staff Portal Card */}
          <div className="bg-white rounded-2xl border border-[#E8E3C3] p-7 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#C43C1E]/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
                  <Store className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FAF8E8] border border-[#E8E3C3] text-[11px] font-semibold text-[#777777]">
                  <Tablet className="w-3.5 h-3.5 text-[#C43C1E]" />
                  <span>Tablet Optimized</span>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-[#222222] tracking-tight">
                Staff Billing Terminal
              </h2>
              <p className="text-sm text-[#777777] mt-2 leading-relaxed">
                Counter-top interface built for lightning-fast scoops selection, modifiers, order queue tokens, and checkout.
              </p>

              <ul className="mt-6 space-y-2 text-xs text-[#222222]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Rapid order creation & category navigation</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Persistent cart summary & touch ergonomics</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Shift history & token generation layout</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-5 border-t border-[#E8E3C3]">
              <Link
                href="/staff"
                className="w-full h-12 rounded-xl bg-[#C43C1E] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#AB3419] transition-colors shadow-xs group/btn"
              >
                <span>Launch Staff Portal</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Owner Portal Card */}
          <div className="bg-white rounded-2xl border border-[#E8E3C3] p-7 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#222222]/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#222222] text-white flex items-center justify-center shadow-xs">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FAF8E8] border border-[#E8E3C3] text-[11px] font-semibold text-[#777777]">
                  <Monitor className="w-3.5 h-3.5 text-[#222222]" />
                  <span>Desktop & Tablet</span>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-[#222222] tracking-tight">
                Owner Management Desk
              </h2>
              <p className="text-sm text-[#777777] mt-2 leading-relaxed">
                Command center for sales reporting, daily Z-reports, menu pricing, staff permissions, and shop configuration.
              </p>

              <ul className="mt-6 space-y-2 text-xs text-[#222222]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Real-time revenue metrics & telemetry</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Daily Z-Report & cash drawer audit</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C43C1E] shrink-0" />
                  <span>Menu catalog CRUD & price governance</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-5 border-t border-[#E8E3C3]">
              <Link
                href="/owner"
                className="w-full h-12 rounded-xl bg-[#222222] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#333333] transition-colors shadow-xs group/btn"
              >
                <span>Enter Owner Portal</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>

        {/* Foundation & Architecture Specs Notice */}
        <div className="mt-12 w-full max-w-4xl bg-white/70 border border-[#E8E3C3] rounded-xl p-5 text-xs text-[#777777] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-[#C43C1E] shrink-0" />
            <div>
              <span className="font-bold text-[#222222]">Phase 0 Architecture Active:</span>{' '}
              <span>Functional billing engine and database operations are strictly deferred to Phases 1–7.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#222222] bg-[#FAF8E8] px-2.5 py-1 rounded-md border border-[#E8E3C3]">
              <FileCode2 className="w-3.5 h-3.5 text-[#C43C1E]" />
              docs/context.md
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E8E3C3] bg-white py-6 px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#777777]">
          <div>
            © 2026 Everytime Creamery. Premium Artisan Gelato Billing Platform.
          </div>
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[#222222]">Brand Tokens:</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F9F7DC] border border-[#E8E3C3]" />
              Cream
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C43C1E]" />
              Red
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#222222]" />
              Dark
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
