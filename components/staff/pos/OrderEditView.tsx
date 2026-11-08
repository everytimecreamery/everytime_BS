'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { PosOrder } from '@/lib/pos/order';
import {
  addItemToHistoricalOrder,
  updateHistoricalOrderItemQuantity,
  removeHistoricalOrderItem,
  applyHistoricalOrderDiscount,
  calculatePaymentDifference,
} from '@/lib/pos/orderHistory';
import { formatPaise, DiscountConfig } from '@/lib/pos/calculations';
import {
  MenuItem,
  CategoryId,
  MENU_CATEGORIES,
  getMenuItemsByCategory,
} from '@/lib/mock/menu';
import { AddItemToCartInput } from '@/lib/pos/cart';
import { GelatoVariantDialog } from './GelatoVariantDialog';
import { WaffleOptionsDialog } from './WaffleOptionsDialog';
import { HotChocolateDialog } from './HotChocolateDialog';
import { DiscountDialog } from './DiscountDialog';
import {
  Plus,
  Minus,
  Trash2,
  Tag,
  Save,
  X,
  Search,
  AlertTriangle,
  ArrowLeft,
  Flame,
  Layers,
  IceCream,
  Cherry,
  UtensilsCrossed,
  CupSoda,
  Package,
  Coffee,
} from 'lucide-react';

interface OrderEditViewProps {
  order: PosOrder;
  onSave: (editedOrder: PosOrder) => void;
  onCancel: () => void;
}

export function OrderEditView({ order, onSave, onCancel }: OrderEditViewProps) {
  const [draftOrder, setDraftOrder] = useState<PosOrder>(() =>
    JSON.parse(JSON.stringify(order))
  );
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>('gelato');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states for complex products
  const [selectedGelatoItem, setSelectedGelatoItem] = useState<MenuItem | null>(null);
  const [selectedWaffleItem, setSelectedWaffleItem] = useState<MenuItem | null>(null);
  const [selectedHotChocolateItem, setSelectedHotChocolateItem] = useState<MenuItem | null>(null);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Check if modifications have been made
  const hasChanges = useMemo(() => {
    return (
      draftOrder.totalPaise !== order.totalPaise ||
      draftOrder.items.length !== order.items.length ||
      draftOrder.discount.percent !== order.discount.percent ||
      JSON.stringify(draftOrder.items) !== JSON.stringify(order.items)
    );
  }, [draftOrder, order]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showUnsavedConfirm) {
          setShowUnsavedConfirm(false);
        } else if (hasChanges) {
          setShowUnsavedConfirm(true);
        } else {
          onCancel();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, showUnsavedConfirm, onCancel]);

  // Filter products by category and search
  const categoryProducts = useMemo(() => {
    return getMenuItemsByCategory(activeCategoryId);
  }, [activeCategoryId]);

  const displayedProducts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return categoryProducts;
    return categoryProducts.filter((p) => p.name.toLowerCase().includes(trimmed));
  }, [categoryProducts, searchQuery]);

  // Product addition
  const handleProductClick = (item: MenuItem) => {
    if (item.categoryId === 'waffle') {
      setSelectedWaffleItem(item);
    } else if (item.categoryId === 'tubs') {
      setSelectedGelatoItem(item);
    } else if (item.categoryId === 'hot_chocolate') {
      setSelectedHotChocolateItem(item);
    } else if (item.categoryId === 'gelato') {
      // 85ml single scoop default per Phase 1.1 refinement
      const input: AddItemToCartInput = {
        productId: item.id,
        productName: item.name,
        unitPricePaise: item.basePricePaise,
        variantId: 'cup-85ml',
        variantLabel: '85ml',
        quantity: 1,
      };
      setDraftOrder((prev) => addItemToHistoricalOrder(prev, input));
    } else {
      const input: AddItemToCartInput = {
        productId: item.id,
        productName: item.name,
        unitPricePaise: item.basePricePaise,
        quantity: 1,
      };
      setDraftOrder((prev) => addItemToHistoricalOrder(prev, input));
    }
  };

  // Quantity and item manipulation
  const handleIncrease = (lineId: string) => {
    const item = draftOrder.items.find((i) => i.lineId === lineId);
    if (!item) return;
    setDraftOrder((prev) => updateHistoricalOrderItemQuantity(prev, lineId, item.quantity + 1));
  };

  const handleDecrease = (lineId: string) => {
    const item = draftOrder.items.find((i) => i.lineId === lineId);
    if (!item) return;
    setDraftOrder((prev) => updateHistoricalOrderItemQuantity(prev, lineId, item.quantity - 1));
  };

  const handleRemove = (lineId: string) => {
    setDraftOrder((prev) => removeHistoricalOrderItem(prev, lineId));
  };

  const handleApplyDiscount = (discount: DiscountConfig) => {
    setDraftOrder((prev) => applyHistoricalOrderDiscount(prev, discount));
    setIsDiscountOpen(false);
  };

  const handleCancelClick = () => {
    if (hasChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onCancel();
    }
  };

  const handleSaveClick = () => {
    if (draftOrder.items.length === 0) return;
    onSave(draftOrder);
  };

  const paymentDiff = calculatePaymentDifference(draftOrder);

  // Category Icons
  const categoryIconMap: Record<CategoryId, React.ReactNode> = {
    frequent: <Flame className="w-3.5 h-3.5" />,
    extra: <Layers className="w-3.5 h-3.5" />,
    gelato: <IceCream className="w-3.5 h-3.5" />,
    sundaes: <Cherry className="w-3.5 h-3.5" />,
    waffle: <UtensilsCrossed className="w-3.5 h-3.5" />,
    thickshakes: <CupSoda className="w-3.5 h-3.5" />,
    tubs: <Package className="w-3.5 h-3.5" />,
    hot_chocolate: <Coffee className="w-3.5 h-3.5" />,
  };

  return (
    <div
      aria-label={`Editing Order ${order.token}`}
      className="flex flex-col h-full bg-white rounded-2xl overflow-hidden select-none"
    >
      {/* 1. Header Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#E8E3C3] bg-[#FAF8E8] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCancelClick}
            aria-label="Cancel"
            className="h-8 px-2.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#222222] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-[#222222]">
                Editing Order {order.token}
              </h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                Edit Mode
              </span>
            </div>
            <p className="text-[11px] text-[#777777] hidden sm:block">
              Add or remove products, adjust quantities, or update discounts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={draftOrder.items.length === 0}
            aria-label="Save Changes"
            className="h-8 px-3.5 rounded-lg bg-[#C43C1E] hover:bg-[#AB3419] disabled:opacity-50 text-white text-xs font-black tracking-wide flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Changes</span>
          </button>
          <button
            type="button"
            onClick={handleCancelClick}
            aria-label="Close Edit View"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Two-Column View: Catalog on Left, Order Cart on Right */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* Left: Product Catalog & Category Selection (7 columns) */}
        <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-[#E8E3C3] min-h-0 overflow-hidden bg-[#FAF8E8]/40">
          {/* Category Bar & Search */}
          <div className="p-3 border-b border-[#E8E3C3] bg-white space-y-2 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search menu to add products..."
                aria-label="Search menu to add products"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 bg-[#FAF8E8] rounded-lg border border-[#E8E3C3] text-xs text-[#222222] placeholder:text-[#777777] focus:outline-none focus:border-[#C43C1E]"
              />
            </div>

            {/* Category Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {MENU_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(cat.id);
                    setSearchQuery('');
                  }}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                    activeCategoryId === cat.id
                      ? 'bg-[#C43C1E] text-white shadow-2xs'
                      : 'bg-[#FAF8E8] hover:bg-[#E8E3C3] text-[#222222] border border-[#E8E3C3]'
                  }`}
                >
                  {categoryIconMap[cat.id]}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {displayedProducts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleProductClick(item)}
                aria-label={`Add ${item.name}`}
                className="p-2.5 rounded-xl bg-white border border-[#E8E3C3] hover:border-[#C43C1E] text-left flex flex-col justify-between transition-all hover:shadow-xs active:scale-98 cursor-pointer group"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[#777777] mb-1">
                    <span className="font-semibold uppercase tracking-wider">
                      {item.categoryId === 'gelato' ? '85ml' : ''}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-[#C43C1E] group-hover:scale-110 transition-transform" />
                  </div>
                  <h4 className="text-xs font-bold text-[#222222] line-clamp-2 leading-tight">
                    {item.name}
                  </h4>
                </div>
                <div className="pt-2 mt-2 border-t border-[#FAF8E8] flex justify-between items-baseline">
                  <span className="text-xs font-black text-[#C43C1E] tabular-nums">
                    {formatPaise(item.basePricePaise)}
                  </span>
                  <span className="text-[10px] font-bold text-[#777777] group-hover:text-[#C43C1E]">
                    + Add
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Order Items & Pricing Calculator (5 columns) */}
        <div className="lg:col-span-5 flex flex-col min-h-0 overflow-hidden bg-white">
          <div className="p-3 border-b border-[#E8E3C3] bg-[#FAF8E8]/60 flex items-center justify-between shrink-0">
            <span className="text-xs font-extrabold text-[#222222] uppercase tracking-wide">
              Order Items ({draftOrder.totalQuantity})
            </span>
            <button
              type="button"
              onClick={() => setIsDiscountOpen(true)}
              className="h-7 px-2.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[11px] font-bold text-[#C43C1E] flex items-center gap-1 cursor-pointer"
            >
              <Tag className="w-3 h-3" />
              <span>
                {draftOrder.discount.type === 'none'
                  ? 'Add Discount'
                  : `${draftOrder.discount.percent}% Off`}
              </span>
            </button>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-[#FAF8E8] space-y-2">
            {draftOrder.items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#777777]">
                <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                <p className="text-xs font-bold text-[#222222]">Cart is empty</p>
                <p className="text-[11px] text-[#777777] mt-1">
                  At least one item is required to save modifications.
                </p>
              </div>
            ) : (
              draftOrder.items.map((item) => (
                <div key={item.lineId} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#222222] truncate">{item.productName}</div>
                    <div className="text-[10.5px] text-[#777777] flex items-center gap-1.5 flex-wrap mt-0.5">
                      {item.variantLabel && (
                        <span className="px-1 py-0.2 rounded bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                          {item.variantLabel}
                        </span>
                      )}
                      {item.addOnLabel && (
                        <span className="px-1 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          + {item.addOnLabel}
                        </span>
                      )}
                      <span>{formatPaise(item.unitPricePaise)} each</span>
                    </div>
                  </div>

                  {/* Quantity Stepper & Line Total */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center border border-[#E8E3C3] rounded-lg overflow-hidden bg-[#FAF8E8]">
                      <button
                        type="button"
                        onClick={() => handleDecrease(item.lineId)}
                        aria-label={`Decrease quantity of ${item.productName}`}
                        className="w-6 h-6 flex items-center justify-center hover:bg-white text-[#222222] transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncrease(item.lineId)}
                        aria-label={`Increase quantity of ${item.productName}`}
                        className="w-6 h-6 flex items-center justify-center hover:bg-white text-[#222222] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-extrabold text-[#222222] tabular-nums w-14 text-right">
                      {formatPaise(item.lineTotalPaise)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.lineId)}
                      aria-label={`Remove ${item.productName}`}
                      className="w-6 h-6 flex items-center justify-center text-[#777777] hover:text-[#C43C1E] hover:bg-red-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Financial Breakdown & Payment Difference Preview */}
          <div className="p-3.5 bg-[#FAF8E8]/70 border-t border-[#E8E3C3] space-y-2 text-xs shrink-0">
            <div className="flex justify-between text-[#777777]">
              <span>Subtotal</span>
              <span className="font-bold text-[#222222] tabular-nums">
                {formatPaise(draftOrder.subtotalPaise)}
              </span>
            </div>

            {draftOrder.discountPaise > 0 && (
              <div className="flex justify-between text-[#C43C1E]">
                <span>Discount ({draftOrder.discount.percent}%)</span>
                <span className="font-bold tabular-nums">-{formatPaise(draftOrder.discountPaise)}</span>
              </div>
            )}

            <div className="flex justify-between text-[#777777]">
              <span>5% GST preview</span>
              <span className="font-bold text-[#222222] tabular-nums">
                {formatPaise(draftOrder.taxPreviewPaise)}
              </span>
            </div>

            <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline font-black">
              <span className="text-xs uppercase text-[#222222]">Updated Total</span>
              <span className="text-xl text-[#C43C1E] tabular-nums">
                {formatPaise(draftOrder.totalPaise)}
              </span>
            </div>

            {/* Reconciliation Difference Preview */}
            <div className="pt-2 border-t border-dashed border-[#E8E3C3] text-[11px] space-y-1">
              <div className="flex justify-between text-[#777777]">
                <span>Original Paid:</span>
                <span className="font-bold text-[#222222] tabular-nums">
                  {formatPaise(paymentDiff.originalTotalPaise)}
                </span>
              </div>
              <div className="flex justify-between items-center font-bold">
                <span>Net Difference:</span>
                <span
                  className={
                    paymentDiff.differencePaise > 0
                      ? 'text-[#C43C1E]'
                      : paymentDiff.differencePaise < 0
                      ? 'text-blue-700'
                      : 'text-emerald-700'
                  }
                >
                  {paymentDiff.differencePaise > 0
                    ? `+${formatPaise(paymentDiff.differencePaise)} (Due)`
                    : paymentDiff.differencePaise < 0
                    ? `-${formatPaise(Math.abs(paymentDiff.differencePaise))} (Refund)`
                    : '₹0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Product Option Modal Handlers */}
      <WaffleOptionsDialog
        isOpen={Boolean(selectedWaffleItem)}
        item={selectedWaffleItem}
        onClose={() => setSelectedWaffleItem(null)}
        onSelectOption={(item, addOnId, addOnLabel, totalPricePaise) => {
          const input: AddItemToCartInput = {
            productId: item.id,
            productName: item.name,
            unitPricePaise: totalPricePaise,
            addOnId: addOnId === 'scoop-none' ? undefined : addOnId,
            addOnLabel: addOnId === 'scoop-none' ? undefined : addOnLabel,
            quantity: 1,
          };
          setDraftOrder((prev) => addItemToHistoricalOrder(prev, input));
          setSelectedWaffleItem(null);
        }}
      />

      <GelatoVariantDialog
        isOpen={Boolean(selectedGelatoItem)}
        item={selectedGelatoItem}
        onClose={() => setSelectedGelatoItem(null)}
        onSelectVariant={(item, variantId, variantLabel, pricePaise) => {
          const input: AddItemToCartInput = {
            productId: item.id,
            productName: item.name,
            unitPricePaise: pricePaise,
            variantId,
            variantLabel,
            quantity: 1,
          };
          setDraftOrder((prev) => addItemToHistoricalOrder(prev, input));
          setSelectedGelatoItem(null);
        }}
      />

      <HotChocolateDialog
        isOpen={Boolean(selectedHotChocolateItem)}
        item={selectedHotChocolateItem}
        onClose={() => setSelectedHotChocolateItem(null)}
        onSelectOption={(item, variantId, variantLabel, pricePaise) => {
          const input: AddItemToCartInput = {
            productId: item.id,
            productName: item.name,
            unitPricePaise: pricePaise,
            variantId,
            variantLabel,
            quantity: 1,
          };
          setDraftOrder((prev) => addItemToHistoricalOrder(prev, input));
          setSelectedHotChocolateItem(null);
        }}
      />

      <DiscountDialog
        isOpen={isDiscountOpen}
        currentDiscount={draftOrder.discount}
        onClose={() => setIsDiscountOpen(false)}
        onApplyDiscount={handleApplyDiscount}
      />

      {/* 4. Unsaved Changes Discard Confirmation Dialog */}
      {showUnsavedConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-confirm-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 id="discard-confirm-title" className="text-base font-bold text-[#222222]">
              Discard Unsaved Changes?
            </h3>
            <p className="text-xs text-[#777777] mt-1 mb-5">
              You have modified Order {order.token}. If you cancel now, your changes will be discarded and the original order will be restored.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowUnsavedConfirm(false)}
                className="flex-1 h-9 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#222222] transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-9 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
