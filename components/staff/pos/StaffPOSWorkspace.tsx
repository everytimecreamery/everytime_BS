'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  CategoryId,
  MenuItem,
} from '@/lib/mock/menu';
import { useStaffMenuCatalog } from '@/lib/pos/menuCatalog';
import {
  PosOrder,
  PaymentMethod,
  createNewPosOrder,
  addItemToOrder,
  updateOrderItemQuantity,
  removeOrderItem,
  clearOrderItems,
  applyOrderDiscount,
  completeOrderPayment,
  purgeExpiredCompletedOrders,
} from '@/lib/pos/order';
import { pushOrderToDatabase } from '@/lib/supabase/orders';
import { addOrderToHistory } from '@/lib/pos/orderHistory';
import { DiscountConfig, formatPaise } from '@/lib/pos/calculations';
import { formatOrderToken, formatTerminalToken } from '@/lib/utils';
import { PosHeader } from './PosHeader';
import { OrderManagementBar } from './OrderManagementBar';
import { CategorySidebar } from './CategorySidebar';
import { ProductSearch } from './ProductSearch';
import { ProductGrid } from './ProductGrid';
import { PriceTierChips, derivePriceTiers } from './PriceTierChips';
import { CartPanel } from './CartPanel';
import { GelatoVariantDialog } from './GelatoVariantDialog';
import { WaffleOptionsDialog } from './WaffleOptionsDialog';
import { HotChocolateDialog } from './HotChocolateDialog';
import { ClearCartDialog } from './ClearCartDialog';
import { DiscountDialog } from './DiscountDialog';
import { PaymentPreviewDialog } from './PaymentPreviewDialog';
import { OrderHistoryModal } from './OrderHistoryModal';
import { ShoppingBag } from 'lucide-react';

export function StaffPOSWorkspace() {
  const { categories: catalogCategories, getItemsByCategory } = useStaffMenuCatalog();
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>('frequent');
  const [selectedPriceTier, setSelectedPriceTier] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Orders state: Multi-order session array (starts reliably at #001)
  const [orders, setOrders] = useState<PosOrder[]>(() => [createNewPosOrder()]);
  const [activeOrderId, setActiveOrderId] = useState<string>(() => orders[0]?.id || '');

  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);

  // 1. Rehydrate active processing tickets from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('active_pos_tickets_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tickets) && parsed.tickets.length > 0) {
          setOrders(parsed.tickets);
          if (parsed.activeOrderId) {
            setActiveOrderId(parsed.activeOrderId);
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // 2. Persist active PROCESSING tickets to localStorage on every mutation
  useEffect(() => {
    try {
      const processingOnly = orders.filter((o) => o.status === 'PROCESSING');
      if (processingOnly.length > 0) {
        localStorage.setItem(
          'active_pos_tickets_v1',
          JSON.stringify({ tickets: processingOnly, activeOrderId })
        );
      }
    } catch {
      // ignore
    }
  }, [orders, activeOrderId]);

  // 3. Auto-purge completed orders from active queue after 60 seconds (1-minute auto-reset)
  useEffect(() => {
    const timer = setInterval(() => {
      setOrders((prev) => purgeExpiredCompletedOrders(prev, 60_000));
    }, 5_000);
    return () => clearInterval(timer);
  }, []);

  // Ensure activeOrderId always points to a valid order
  const activeOrder = useMemo(() => {
    const found = orders.find((o) => o.id === activeOrderId);
    return found || orders.find((o) => o.status === 'PROCESSING') || orders[0];
  }, [orders, activeOrderId]);

  // Dialog states
  const [gelatoItem, setGelatoItem] = useState<MenuItem | null>(null);
  const [waffleItem, setWaffleItem] = useState<MenuItem | null>(null);
  const [hotChocItem, setHotChocItem] = useState<MenuItem | null>(null);
  const [isClearCartOpen, setIsClearCartOpen] = useState(false);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isPaymentPreviewOpen, setIsPaymentPreviewOpen] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Products for currently selected category (dynamic live catalog)
  const categoryProducts = useMemo(() => {
    return getItemsByCategory(activeCategoryId);
  }, [activeCategoryId, getItemsByCategory]);

  // Derived price tiers when active category is gelato
  const gelatoPriceTiers = useMemo(() => {
    if (activeCategoryId !== 'gelato') return [];
    return derivePriceTiers(categoryProducts);
  }, [activeCategoryId, categoryProducts]);

  // Filtered products: activeCategory ∩ activeTier ∩ searchQuery (AND)
  const displayedProducts = useMemo(() => {
    let result = categoryProducts;

    // Apply price-tier filter when active category is gelato
    if (activeCategoryId === 'gelato' && selectedPriceTier !== 'all') {
      result = result.filter((p) => p.basePricePaise === selectedPriceTier);
    }

    // Apply search query filter
    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed) {
      result = result.filter((p) => p.name.toLowerCase().includes(trimmed));
    }

    return result;
  }, [categoryProducts, activeCategoryId, selectedPriceTier, searchQuery]);

  // New Order Handler
  const handleNewOrder = () => {
    // If the active order is currently empty and in PROCESSING, do not create duplicate empty order
    if (activeOrder.status === 'PROCESSING' && activeOrder.items.length === 0) {
      return;
    }

    // Check if there is an existing empty PROCESSING order to reuse
    const existingEmptyProcessing = orders.find(
      (o) => o.status === 'PROCESSING' && o.items.length === 0
    );
    if (existingEmptyProcessing) {
      setActiveOrderId(existingEmptyProcessing.id);
      return;
    }

    // Create a new independent working order with next sequential token
    const newOrder = createNewPosOrder();
    setOrders((prev) => [...prev, newOrder]);
    setActiveOrderId(newOrder.id);
  };

  // Order Selection
  const handleSelectOrder = (orderId: string) => {
    setActiveOrderId(orderId);
  };

  // Product Selection Router
  const handleSelectProduct = (item: MenuItem) => {
    // Completed orders are read-only
    if (activeOrder.status === 'COMPLETED') {
      return;
    }

    if (item.interactionType === 'gelato_sizes') {
      if (activeCategoryId === 'tubs') {
        // Takeaway Tubs: pop up size selector for 250ml and 500ml options
        setGelatoItem(item);
      } else {
        // Gelato (and Frequent): counter cups are strictly single 85ml — do NOT pop up!
        setOrders((prev) =>
          prev.map((o) =>
            o.id === activeOrder.id
              ? addItemToOrder(o, {
                  productId: item.id,
                  productName: item.name,
                  variantId: '85ml',
                  variantLabel: '85ml',
                  unitPricePaise: item.basePricePaise,
                  quantity: 1,
                })
              : o
          )
        );
      }
    } else if (item.interactionType === 'waffle_scoop') {
      setWaffleItem(item);
    } else if (item.interactionType === 'hot_chocolate_options') {
      setHotChocItem(item);
    } else {
      // Direct add to active order
      setOrders((prev) =>
          prev.map((o) =>
            o.id === activeOrder.id
              ? addItemToOrder(o, {
                productId: item.id,
                productName: item.name,
                unitPricePaise: item.basePricePaise,
                quantity: 1,
              })
              : o
          )
        );
    }
  };

  // Gelato Variant Selected
  const handleConfirmGelatoVariant = (
    item: MenuItem,
    variantId: string,
    variantLabel: string,
    pricePaise: number
  ) => {
    if (activeOrder.status === 'COMPLETED') return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? addItemToOrder(o, {
            productId: item.id,
            productName: item.name,
            variantId,
            variantLabel,
            unitPricePaise: pricePaise,
            quantity: 1,
          })
          : o
      )
    );
  };

  // Waffle Option Selected
  const handleConfirmWaffleOption = (
    item: MenuItem,
    addOnId: string,
    addOnLabel: string,
    totalPricePaise: number
  ) => {
    if (activeOrder.status === 'COMPLETED') return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? addItemToOrder(o, {
            productId: item.id,
            productName: item.name,
            addOnId,
            addOnLabel: addOnId === 'scoop-none' ? undefined : addOnLabel,
            unitPricePaise: totalPricePaise,
            quantity: 1,
          })
          : o
      )
    );
  };

  // Hot Chocolate Option Selected
  const handleConfirmHotChocolate = (
    item: MenuItem,
    variantId: string,
    variantLabel: string,
    pricePaise: number
  ) => {
    if (activeOrder.status === 'COMPLETED') return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? addItemToOrder(o, {
            productId: item.id,
            productName: item.name,
            variantId,
            variantLabel,
            unitPricePaise: pricePaise,
            quantity: 1,
          })
          : o
      )
    );
  };

  // Quantity Steppers
  const handleIncreaseQuantity = (lineId: string) => {
    if (activeOrder.status === 'COMPLETED') return;
    const item = activeOrder.items.find((i) => i.lineId === lineId);
    if (!item) return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? updateOrderItemQuantity(o, lineId, item.quantity + 1)
          : o
      )
    );
  };

  const handleDecreaseQuantity = (lineId: string) => {
    if (activeOrder.status === 'COMPLETED') return;
    const item = activeOrder.items.find((i) => i.lineId === lineId);
    if (!item) return;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? updateOrderItemQuantity(o, lineId, item.quantity - 1)
          : o
      )
    );
  };

  const handleRemoveItem = (lineId: string) => {
    if (activeOrder.status === 'COMPLETED') return;
    setOrders((prev) =>
      prev.map((o) => (o.id === activeOrder.id ? removeOrderItem(o, lineId) : o))
    );
  };

  const handleClearCart = () => {
    if (activeOrder.status === 'COMPLETED') return;
    setOrders((prev) =>
      prev.map((o) => (o.id === activeOrder.id ? clearOrderItems(o) : o))
    );
  };

    const handleApplyDiscount = (discount: DiscountConfig) => {
      if (activeOrder.status === 'COMPLETED') return;
      setOrders((prev) =>
        prev.map((o) => (o.id === activeOrder.id ? applyOrderDiscount(o, discount) : o))
      );
    };

  // Workflow: Payment Confirmation (Completes active order and directly pushes to Supabase database)
  const handleConfirmPayment = (
    method: PaymentMethod,
    tenderedPaise?: number,
    changePaise?: number
  ) => {
    if (activeOrder.items.length === 0) return;

    const completedOrder = completeOrderPayment(activeOrder, method, tenderedPaise, changePaise);

    // 1. Directly push completed order to Supabase database (immediately visible to Owner app)
    pushOrderToDatabase(completedOrder, method, tenderedPaise, changePaise);

    // 2. Persist to permanent local order history
    addOrderToHistory(completedOrder);

    // 3. Clear from active queue and initialize next order token
    const nextOrder = createNewPosOrder();

    setOrders((prev) => {
      const otherOrders = prev.filter((o) => o.id !== activeOrder.id && o.status === 'PROCESSING');
      return [...otherOrders, nextOrder];
    });

    setActiveOrderId(nextOrder.id);
    setIsPaymentPreviewOpen(false);
  };

  return (
    <div className="h-full max-h-full flex flex-col gap-2 overflow-hidden select-none">
      {/* 1. Main POS Compact Header */}
      <PosHeader
        activeOrderToken={activeOrder.token}
        activeOrderStatus={activeOrder.status}
        onNewOrder={handleNewOrder}
        onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
      />

      {/* 2. Order Management Area: Active Processing Orders Queue */}
      <OrderManagementBar
        orders={orders}
        activeOrderId={activeOrderId}
        onSelectOrder={handleSelectOrder}
      />

            {/* Mobile Cart Floating Pill Bar */}
              <div className="lg:hidden shrink-0 bg-white p-2.5 rounded-xl border border-[#E8E3C3] shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center font-bold text-xs">
                      {activeOrder.totalQuantity}
                    </div>
                    <div>
                        <span className="text-[11px] text-[#777777] block">
                          Order {activeOrder.token}
                        </span>
                        <span className="text-xs font-black text-[#222222] tabular-nums">
                          {formatPaise(activeOrder.totalPaise)}
                        </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMobileCartOpen((prev) => !prev)}
                    className="h-8 px-3 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-bold text-[#C43C1E] flex items-center gap-1.5 hover:bg-[#C43C1E] hover:text-white transition-colors cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{isMobileCartOpen ? 'Hide Cart' : 'View Cart'}</span>
                  </button>
                </div>

                  {/* 3. Main Three-Panel Viewport Layout */}
                  <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2 sm:gap-2.5 overflow-hidden">
                    {/* Panel A: Left Fixed Category Sidebar */}
                    <section
                      aria-label="Categories Sidebar"
                      className="md:col-span-3 lg:col-span-2 flex flex-col min-h-0 overflow-hidden"
                    >
                      <CategorySidebar
                        activeCategoryId={activeCategoryId}
                        categories={catalogCategories}
                        onSelectCategory={(id) => {
                          setActiveCategoryId(id);
                          setSelectedPriceTier('all');
                          setSearchQuery('');
                        }}
                      />
                    </section>

                    {/* Panel B: Center Menu Products (ONLY THIS CONTAINER SCROLLS) */}
                    <section
                      aria-label="Direct Menu Catalog"
                      className="md:col-span-9 lg:col-span-6 xl:col-span-7 flex flex-col min-h-0 bg-[#FAF8E8] rounded-2xl border border-[#E8E3C3] p-2.5 sm:p-3 overflow-hidden shadow-2xs"
                    >
                      {/* Search bar (Fixed at top of center panel) */}
                      <div className="shrink-0 mb-2">
                        <ProductSearch
                          searchQuery={searchQuery}
                          onSearchChange={setSearchQuery}
                          onClearSearch={() => setSearchQuery('')}
                        />
                      </div>

                      {/* Gelato Price Tier Chips (Directly below search bar, fixed height, non-scrolling) */}
                      {activeCategoryId === 'gelato' && (
                        <div className="shrink-0 mb-2">
                          <PriceTierChips
                            tiers={gelatoPriceTiers}
                            selectedTier={selectedPriceTier}
                            onSelectTier={setSelectedPriceTier}
                          />
                        </div>
                      )}

                        {/* Product Grid Area: INDEPENDENT VERTICAL SCROLLING */}
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                          <ProductGrid
                            items={displayedProducts}
                            onSelect={handleSelectProduct}
                            activeCategoryId={activeCategoryId}
                            searchQuery={searchQuery}
                            onClearSearch={() => setSearchQuery('')}
                            selectedPriceTier={selectedPriceTier}
                          />
                        </div>
                    </section>

                    {/* Panel C: Right Order Cart Panel (Fixed within viewport, summary pinned at bottom) */}
                    <section
                      aria-label="Order Cart Sidebar"
                      className={`md:col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col min-h-0 overflow-hidden ${isMobileCartOpen ? 'block' : 'hidden lg:flex'
                        }`}
                    >
                      <CartPanel
                        order={activeOrder}
                        onIncrease={handleIncreaseQuantity}
                        onDecrease={handleDecreaseQuantity}
                        onRemove={handleRemoveItem}
                        onRequestClearCart={() => setIsClearCartOpen(true)}
                        onOpenDiscountDialog={() => setIsDiscountOpen(true)}
                        onOpenPaymentPreview={() => setIsPaymentPreviewOpen(true)}
                        onStartNextOrder={handleNewOrder}
                      />
                    </section>
                  </div>

                  {/* Interactive Selection Dialogs */}
                  <GelatoVariantDialog
                    isOpen={gelatoItem !== null}
                    item={gelatoItem}
                    onClose={() => setGelatoItem(null)}
                    onSelectVariant={handleConfirmGelatoVariant}
                  />

                  <WaffleOptionsDialog
                    isOpen={waffleItem !== null}
                    item={waffleItem}
                    onClose={() => setWaffleItem(null)}
                    onSelectOption={handleConfirmWaffleOption}
                  />

                  <HotChocolateDialog
                    isOpen={hotChocItem !== null}
                    item={hotChocItem}
                    onClose={() => setHotChocItem(null)}
                    onSelectOption={handleConfirmHotChocolate}
                  />

                  <ClearCartDialog
                    isOpen={isClearCartOpen}
                    onClose={() => setIsClearCartOpen(false)}
                    onConfirm={handleClearCart}
                  />

                  <DiscountDialog
                    isOpen={isDiscountOpen}
                    currentDiscount={activeOrder.discount}
                    onClose={() => setIsDiscountOpen(false)}
                    onApplyDiscount={handleApplyDiscount}
                  />

                  <PaymentPreviewDialog
                    isOpen={isPaymentPreviewOpen}
                    order={activeOrder}
                    onClose={() => setIsPaymentPreviewOpen(false)}
                    onConfirmPayment={handleConfirmPayment}
                  />

                  <OrderHistoryModal
                    isOpen={isOrderHistoryOpen}
                    onClose={() => setIsOrderHistoryOpen(false)}
                  />
                </div>
                );
}
