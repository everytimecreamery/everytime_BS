'use client';

import React from 'react';
import { Product } from '@/lib/mock-data/products';
import { ProductCard } from './ProductCard';
import { PackageOpen } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

export function ProductGrid({ products, onSelectProduct }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white/60 border border-dashed border-[#E8E3C3] rounded-2xl text-center">
        <PackageOpen className="w-10 h-10 text-[#777777] mb-2" />
        <h4 className="text-sm font-bold text-[#222222]">No Products Available</h4>
        <p className="text-xs text-[#777777] mt-1">
          No items found in this category.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 auto-rows-fr">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onSelectProduct={onSelectProduct}
        />
      ))}
    </div>
  );
}

