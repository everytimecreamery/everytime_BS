import React from 'react';

interface StatusBadgeProps {
  label: string;
  variant?: 'brand' | 'neutral' | 'subtle';
  className?: string;
}

export function StatusBadge({
  label,
  variant = 'neutral',
  className = '',
}: StatusBadgeProps) {
  const variantStyles = {
    brand: 'bg-[#C43C1E]/10 text-[#C43C1E] border-[#C43C1E]/25',
    neutral: 'bg-white text-[#222222] border-[#E8E3C3]',
    subtle: 'bg-[#FAF8E8] text-[#777777] border-[#E8E3C3]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-xs tracking-wide ${variantStyles} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#C43C1E]" aria-hidden="true" />
      {label}
    </span>
  );
}

