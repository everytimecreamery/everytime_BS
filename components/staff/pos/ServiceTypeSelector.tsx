'use client';

import React from 'react';
import { ServiceType } from '@/lib/pos/cart';
import { Utensils, Package } from 'lucide-react';

interface ServiceTypeSelectorProps {
  serviceType: ServiceType;
  onSelectServiceType: (type: ServiceType) => void;
}

export function ServiceTypeSelector({
  serviceType,
  onSelectServiceType,
}: ServiceTypeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Order Service Type"
      className="inline-flex items-center p-1 bg-[#FAF8E8] border border-[#E8E3C3] rounded-xl shadow-2xs"
    >
      <button
        type="button"
        onClick={() => onSelectServiceType('dine_in')}
        aria-pressed={serviceType === 'dine_in'}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
          serviceType === 'dine_in'
            ? 'bg-[#C43C1E] text-white shadow-xs'
            : 'text-[#222222] hover:bg-white/60'
        }`}
      >
        <Utensils className="w-3.5 h-3.5" />
        <span>Dine-in</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectServiceType('parcel')}
        aria-pressed={serviceType === 'parcel'}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
          serviceType === 'parcel'
            ? 'bg-[#C43C1E] text-white shadow-xs'
            : 'text-[#222222] hover:bg-white/60'
        }`}
      >
        <Package className="w-3.5 h-3.5" />
        <span>Parcel</span>
      </button>
    </div>
  );
}

