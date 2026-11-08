'use client';

import React from 'react';
import { Product } from '@/lib/mock-data/products';
import { formatPaise } from '@/lib/cart/pricing';
import { Plus, SlidersHorizontal, IceCream, Coffee, Package } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelectProduct: (product: Product) => void;
}

export function ProductCard({ product, onSelectProduct }: ProductCardProps) {
  return (
    <div
      role="article"
      aria-label={product.name}
      onClick={() => onSelectProduct(product)}
      className="bg-white rounded-2xl border border-[#E8E3C3] p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-[#C43C1E]/40 transition-all cursor-pointer group select-none min-h-[170px]"
    >
      <div>
        {/* Top meta row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] group-hover:bg-[#C43C1E] group-hover:text-white transition-colors">
            {product.productType === 'tub' ? (
              <Package className="w-4 h-4" />
            ) : product.productType === 'beverage' ? (
              <Coffee className="w-4 h-4" />
            ) : (
              <IceCream className="w-4 h-4" />
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {product.requiresConfiguration ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FAF8E8] text-[#777777] border border-[#E8E3C3]">
                {product.fixedSize ? `${product.fixedSize}` : 'Customizable'}
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Quick Add
              </span>
            )}
          </div>
        </div>

        {/* Product Details */}
        <h4 className="text-base font-bold text-[#222222] group-hover:text-[#C43C1E] transition-colors leading-snug">
          {product.name}
        </h4>
        <p className="text-xs text-[#777777] mt-1 line-clamp-2 leading-relaxed">
          {product.description}
        </p>
      </div>

      {/* Pricing and Action row */}
      <div className="pt-3.5 mt-3 border-t border-[#FAF8E8] flex items-center justify-between">
        <div>
          <span className="text-[11px] text-[#777777] block font-medium">Base Price</span>
          <span className="text-base font-extrabold text-[#222222] tabular-nums">
            {formatPaise(product.basePricePaise)}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectProduct(product);
          }}
          className={`h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs ${product.requiresConfiguration
              ? 'bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] hover:bg-[#C43C1E] hover:text-white'
              : 'bg-[#C43C1E] text-white hover:bg-[#AB3419]'
            }`}
        >
          {product.requiresConfiguration ? (
            <>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Choose Flavors</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
