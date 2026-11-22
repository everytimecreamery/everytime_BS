'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { loginOwnerAction, AuthActionResult } from './actions';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Store,
  ArrowRight,
} from 'lucide-react';

export function OwnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // If redirected with URL error query param, display friendly notice
  useEffect(() => {
    if (urlError === 'unauthorized') {
      setFormError('Access restricted: Owner credentials required to access this portal.');
    } else if (urlError === 'session_expired') {
      setFormError('Your session has expired. Please log in again to continue.');
    }
  }, [urlError]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Client-side quick validation
    if (!email.trim() || !password) {
      setFormError('Please enter both your email address and password.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    const formData = new FormData();
    formData.append('email', email.trim());
    formData.append('password', password);

    startTransition(async () => {
      try {
        const result: AuthActionResult = await loginOwnerAction(null, formData);
        if (result.success) {
          setSuccess(true);
          // Redirect to owner management desk
          router.push('/owner');
          router.refresh();
        } else {
          setFormError(result.error || 'Authentication failed. Please check your credentials.');
        }
      } catch (err: any) {
        setFormError('An unexpected network error occurred. Please try again.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F9F7DC] text-[#222222] flex flex-col justify-center items-center px-4 py-8 sm:py-12 select-none">
      {/* Top Branding */}
      <div className="mb-6 flex flex-col items-center">
        <BrandLogo size="lg" showTagline={true} href="/" />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E8E3C3] shadow-sm p-6 sm:p-8 flex flex-col relative overflow-hidden">
        {/* Subtle decorative accent */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#222222]/5 rounded-bl-full pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-11 h-11 rounded-xl bg-[#222222] text-white flex items-center justify-center shadow-xs">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <StatusBadge label="Back Office" variant="brand" />
        </div>

        <div>
          <h1 className="text-2xl font-black text-[#222222] tracking-tight">
            Owner Portal Login
          </h1>
          <p className="text-xs text-[#777777] mt-1.5 leading-relaxed">
            Enter your owner credentials to access store oversight, menu governance, and revenue analytics.
          </p>
        </div>

        {/* Error Alert Box */}
        {formError && (
          <div
            role="alert"
            className="mt-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{formError}</div>
          </div>
        )}

        {/* Success Alert Box */}
        {success && (
          <div
            role="status"
            className="mt-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="font-semibold">Credentials verified! Loading Owner Portal...</div>
          </div>
        )}

        {/* Form */}
        <form
          aria-label="Owner Login Form"
          onSubmit={handleSubmit}
          className="mt-5 space-y-4"
        >
          {/* Email Field */}
          <div>
            <label
              htmlFor="owner-email"
              className="block text-xs font-bold text-[#222222] mb-1.5"
            >
              Owner Email Address <span className="text-[#C43C1E]">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="owner-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="owner@everytimecreamery.com"
                value={email}
                disabled={isPending || success}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#E8E3C3] bg-white text-xs sm:text-sm font-medium text-[#222222] placeholder:text-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 focus:border-[#C43C1E] transition-all disabled:opacity-60"
              />
            </div>
          </div>

          {/* Password Field with Visibility Toggle */}
          <div>
            <label
              htmlFor="owner-password"
              className="block text-xs font-bold text-[#222222] mb-1.5"
            >
              Password <span className="text-[#C43C1E]">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="owner-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                disabled={isPending || success}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-[#E8E3C3] bg-white text-xs sm:text-sm font-medium text-[#222222] placeholder:text-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 focus:border-[#C43C1E] transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isPending || success}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#222222] transition-colors p-1 cursor-pointer disabled:opacity-50"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isPending || success}
              className="w-full h-11 rounded-xl bg-[#222222] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-[#333333] transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Redirecting...</span>
                </>
              ) : (
                <>
                  <span>Sign In as Owner</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Divider & Staff POS Redirection */}
        <div className="mt-6 pt-5 border-t border-[#E8E3C3] flex flex-col gap-3">
          <Link
            href="/staff"
            className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-semibold text-[#222222] hover:bg-[#FAF8E8]/70 hover:border-[#C43C1E]/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Store className="w-3.5 h-3.5 text-[#C43C1E]" />
              Staff Member? Go to Counter POS
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[#777777]" />
          </Link>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#777777] pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secure Cookie-Based Session • Supabase SSR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
