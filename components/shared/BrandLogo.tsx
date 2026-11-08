import React from 'react';
import Link from 'next/link';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  href?: string;
  className?: string;
}

export function BrandLogo({
  size = 'md',
  showTagline = true,
  href = '/',
  className = '',
}: BrandLogoProps) {
  const sizeClasses = {
    sm: {
      mark: 'w-7 h-7 text-xs',
      title: 'text-base font-bold tracking-tight',
      tagline: 'text-[10px]',
    },
    md: {
      mark: 'w-9 h-9 text-sm',
      title: 'text-lg font-bold tracking-tight',
      tagline: 'text-xs',
    },
    lg: {
      mark: 'w-12 h-12 text-base',
      title: 'text-2xl font-extrabold tracking-tight',
      tagline: 'text-xs uppercase tracking-widest',
    },
  }[size];

  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Gelato Scoop Stylized Mark */}
      <div
        className={`${sizeClasses.mark} rounded-full bg-[#C43C1E] text-white flex items-center justify-center font-black shadow-sm shrink-0 border-2 border-white`}
        aria-hidden="true"
      >
        <span>EC</span>
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`text-[#222222] ${sizeClasses.title}`}>
          Everytime Creamery
        </span>
        {showTagline && (
          <span className={`text-[#777777] font-medium ${sizeClasses.tagline}`}>
            Artisan Gelato & POS
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C43C1E] rounded-md">
        {content}
      </Link>
    );
  }

  return content;
}

