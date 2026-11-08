import React from 'react';
import { IceCream, Coffee, Package, Sparkles, AlertCircle } from 'lucide-react';

const CATEGORIES = [
  { id: 'gelato', label: 'Gelato Cups & Cones', count: '12 Flavors', icon: IceCream, active: true },
  { id: 'tubs', label: 'Takeaway Tubs (500ml)', count: '8 Varieties', icon: Package, active: false },
  { id: 'beverages', label: 'Espresso & Affogato', count: '6 Items', icon: Coffee, active: false },
  { id: 'specials', label: 'Seasonal Specials', count: '3 Items', icon: Sparkles, active: false },
];

export function StaffMenuPlaceholder() {
  return (
    <div className="flex flex-col h-full bg-[#FAF8E8] rounded-xl border border-[#E8E3C3] p-4 sm:p-5 overflow-hidden">
      {/* Category Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none border-b border-[#E8E3C3]">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all select-none ${
                cat.active
                  ? 'bg-[#C43C1E] text-white shadow-xs'
                  : 'bg-white text-[#222222] border border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{cat.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                  cat.active ? 'bg-white/20 text-white' : 'bg-[#FAF8E8] text-[#777777]'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Menu Grid Placeholder Area */}
      <div className="flex-1 mt-4 flex flex-col items-center justify-center border-2 border-dashed border-[#E8E3C3] rounded-xl p-8 text-center bg-white/60">
        <div className="w-16 h-16 rounded-2xl bg-[#C43C1E]/10 flex items-center justify-center text-[#C43C1E] mb-4">
          <IceCream className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#222222]">
          Menu & Flavor Selection Grid
        </h3>
        <p className="text-sm text-[#777777] max-w-md mt-1.5 leading-relaxed">
          Product catalog, cup sizes (Piccolo, Medio, Grande), flavor allocations, and stock status indicators will be wired in <strong>Phase 1 & Phase 2</strong>.
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
          {['Piccolo (1 Scoop)', 'Medio (2 Scoops)', 'Grande (3 Scoops)', 'Waffle Cone Add-on', 'Affogato al Caffè', '500ml Party Tub'].map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-white border border-[#E8E3C3] rounded-lg text-left shadow-2xs opacity-75 select-none"
            >
              <div className="w-full h-10 bg-[#FAF8E8] rounded-md flex items-center justify-center text-xs font-semibold text-[#777777] mb-2">
                Item Slot #{idx + 1}
              </div>
              <p className="text-xs font-bold text-[#222222] truncate">{item}</p>
              <p className="text-[11px] text-[#777777] mt-0.5">Phase 1 Data Contract</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-6 px-3 py-1.5 rounded-md bg-[#FAF8E8] text-xs text-[#777777] border border-[#E8E3C3]">
          <AlertCircle className="w-3.5 h-3.5 text-[#C43C1E]" />
          <span>Interactive flavor matrix & pricing calculations scheduled for Phase 2 & 3</span>
        </div>
      </div>
    </div>
  );
}

