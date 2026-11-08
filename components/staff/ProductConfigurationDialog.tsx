'use client';

import React, { useState, useEffect } from 'react';
import { Product, GELATO_SIZES } from '@/lib/mock-data/products';
import { MOCK_FLAVORS, Flavor } from '@/lib/mock-data/flavors';
import { GelatoCupSize } from '@/types';
import { CartFlavorSelection } from '@/lib/cart/cart-types';
import { formatPaise } from '@/lib/cart/pricing';
import { validateProductConfiguration } from '@/lib/cart/cart-utils';
import { FlavorSelector } from './FlavorSelector';
import { X, Plus, Minus, ShoppingBag, IceCream } from 'lucide-react';

interface ProductConfigurationDialogProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onConfirm: (configuredItem: {
    productId: string;
    productName: string;
    unitPricePaise: number;
    quantity: number;
    configuration: {
      size?: GelatoCupSize;
      flavors: CartFlavorSelection[];
    };
  }) => void;
}

interface DialogContentProps {
  product: Product;
  onClose: () => void;
  onConfirm: ProductConfigurationDialogProps['onConfirm'];
}

function ConfigDialogContent({ product, onClose, onConfirm }: DialogContentProps) {
  const [selectedSize, setSelectedSize] = useState<GelatoCupSize>(
    product.fixedSize || 'piccolo'
  );
  const [selectedFlavors, setSelectedFlavors] = useState<CartFlavorSelection[]>([]);
  const [quantity, setQuantity] = useState<number>(1);

  // Calculate unit price and required flavor count based on size
  const isGelatoCup = product.productType === 'gelato_cup';
  const currentSizeConfig = isGelatoCup ? GELATO_SIZES[selectedSize] : null;

  const unitPricePaise = currentSizeConfig
    ? currentSizeConfig.defaultPricePaise
    : product.basePricePaise;

  const currentConfiguration = {
    size: isGelatoCup ? selectedSize : product.fixedSize,
    flavors: selectedFlavors,
  };

  const validation = validateProductConfiguration(product, currentConfiguration);
  const requiredCount = validation.requiredCount;

  // Handle flavor selection
  const handleAddFlavor = (flavor: Flavor) => {
    if (selectedFlavors.length < requiredCount) {
      setSelectedFlavors((prev) => [...prev, { id: flavor.id, name: flavor.name }]);
    }
  };

  const handleRemoveFlavorAtIndex = (index: number) => {
    setSelectedFlavors((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Handle size change
  const handleSizeChange = (newSize: GelatoCupSize) => {
    setSelectedSize(newSize);
    const newMax = GELATO_SIZES[newSize].scoopCount;
    // Trim flavors if switching to smaller size
    if (selectedFlavors.length > newMax) {
      setSelectedFlavors((prev) => prev.slice(0, newMax));
    }
  };

  // Handle submission
  const handleAddToCart = () => {
    if (!validation.isValid) return;

    onConfirm({
      productId: product.id,
      productName: isGelatoCup ? `${product.name} (${selectedSize})` : product.name,
      unitPricePaise,
      quantity,
      configuration: currentConfiguration,
    });
    onClose();
  };

  const totalPaise = unitPricePaise * quantity;

  return (
    <div className="bg-white rounded-3xl border border-[#E8E3C3] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
      {/* Modal Header */}
      <div className="p-5 border-b border-[#E8E3C3] bg-[#FAF8E8]/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
            <IceCream className="w-5 h-5" />
          </div>
          <div>
            <h3 id="config-dialog-title" className="text-lg font-bold text-[#222222]">
              {product.name}
            </h3>
            <p className="text-xs text-[#777777]">{product.description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close configuration dialog"
          className="w-9 h-9 rounded-xl border border-[#E8E3C3] bg-white flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-[#FAF8E8] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal Scrollable Body */}
      <div className="p-5 overflow-y-auto space-y-5 flex-1">
        {/* Size Selector for Gelato Cups */}
        {isGelatoCup && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#777777] mb-2 block">
              Select Cup Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['piccolo', 'medio', 'grande'] as GelatoCupSize[]).map((sizeKey) => {
                const sizeInfo = GELATO_SIZES[sizeKey];
                const isSelected = selectedSize === sizeKey;
                return (
                  <button
                    key={sizeKey}
                    type="button"
                    onClick={() => handleSizeChange(sizeKey)}
                    className={`p-3 rounded-xl border text-center transition-all ${isSelected
                        ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
                        : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
                      }`}
                  >
                    <div className="text-xs font-bold capitalize">{sizeKey}</div>
                    <div
                      className={`text-[11px] font-medium mt-0.5 ${isSelected ? 'text-white/80' : 'text-[#777777]'
                        }`}
                    >
                      {sizeInfo.scoopCount} {sizeInfo.scoopCount === 1 ? 'Scoop' : 'Scoops'}
                    </div>
                    <div
                      className={`text-xs font-extrabold mt-1.5 tabular-nums ${isSelected ? 'text-white' : 'text-[#C43C1E]'
                        }`}
                    >
                      {formatPaise(sizeInfo.defaultPricePaise)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Flavor Selection Component */}
        {requiredCount > 0 && (
          <FlavorSelector
            flavors={MOCK_FLAVORS}
            selectedFlavors={selectedFlavors}
            requiredCount={requiredCount}
            onAddFlavor={handleAddFlavor}
            onRemoveFlavorAtIndex={handleRemoveFlavorAtIndex}
          />
        )}

        {/* Quantity Controls */}
        <div className="pt-3 border-t border-[#E8E3C3] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">
            Quantity
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="w-8 h-8 rounded-lg border border-[#E8E3C3] bg-white flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] disabled:opacity-40 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-bold tabular-nums text-[#222222]">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
              className="w-8 h-8 rounded-lg border border-[#E8E3C3] bg-white flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Footer */}
      <div className="p-5 border-t border-[#E8E3C3] bg-[#FAF8E8]/70 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#777777] block font-medium">Configured Total</span>
            <span className="text-xl font-black text-[#C43C1E] tabular-nums">
              {formatPaise(totalPaise)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl border border-[#E8E3C3] bg-white text-[#777777] hover:text-[#222222] font-bold text-xs transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!validation.isValid}
              className="h-11 px-5 rounded-xl bg-[#C43C1E] text-white font-bold text-xs flex items-center gap-2 hover:bg-[#AB3419] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add to Ticket</span>
            </button>
          </div>
        </div>

        {!validation.isValid && validation.error && (
          <p className="text-[11px] text-[#C43C1E] font-medium text-right">
            {validation.error}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProductConfigurationDialog({
  isOpen,
  product,
  onClose,
  onConfirm,
}: ProductConfigurationDialogProps) {
  // Handle ESC key to dismiss dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <ConfigDialogContent
        key={`${product.id}-${isOpen}`}
        product={product}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </div>
  );
}
