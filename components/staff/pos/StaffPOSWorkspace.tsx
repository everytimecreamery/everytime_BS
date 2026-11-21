'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  CategoryId,
  MenuItem,
  getMenuItemsByCategory,
} from '@/lib/mock/menu';
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
import {
  saveCompletedOrderToOutbox,
  initBackgroundSyncWorker,
  persistActiveTickets,
  loadActiveTickets,
  generateUUID,
} from '@/lib/sync/outbox';
import { DiscountConfig, formatPaise } from '@/lib/pos/calculations';
import { formatOrderToken, formatTerminalToken } from '@/lib/utils';
import { PosHeader } from './PosHeader';
import { OrderManagementBar } from './OrderManagementBar';
import { CategorySidebar } from './CategorySidebar';
import { ProductSearch } from './ProductSearch';
import { ProductGrid } from './ProductGrid';
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
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>('frequent');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Orders state: Multi-order session array (starts reliably at T1-001)
  const [orders, setOrders] = useState<PosOrder[]>(() => [createNewPosOrder('T1-001')]);
  const [activeOrderId, setActiveOrderId] = useState<string>(() => orders[0]?.id || '');

  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);

  // 1. Initialize background sync worker & rehydrate active processing tickets from IndexedDB
  useEffect(() => {
    const cleanupSync = initBackgroundSyncWorker();

    loadActiveTickets().then((cache) => {
      if (cache && Array.isArray(cache.tickets) && cache.tickets.length > 0) {
        setOrders(cache.tickets);
        if (cache.activeOrderId) {
          setActiveOrderId(cache.activeOrderId);
        }
      }
    });

    return () => {
      cleanupSync();
    };
  }, []);

  // 2. Persist active PROCESSING tickets to IndexedDB on every mutation
  useEffect(() => {
    const processingOnly = orders.filter((o) => o.status === 'PROCESSING');
    if (processingOnly.length > 0) {
      persistActiveTickets(processingOnly, activeOrderId);
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

  // Products for currently selected category
  const categoryProducts = useMemo(() => {
    return getMenuItemsByCategory(activeCategoryId);
  }, [activeCategoryId]);

  // Filtered products based on search query
  const displayedProducts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return categoryProducts;
    return categoryProducts.filter((p) => p.name.toLowerCase().includes(trimmed));
  }, [categoryProducts, searchQuery]);

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
    const nextToken = formatOrderToken(orders.length + 1);
    const newOrder = createNewPosOrder(nextToken);
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

  // Workflow: Payment Confirmation (Completes active order and writes to IndexedDB Outbox)
  const handleConfirmPayment = (
    method: PaymentMethod,
    tenderedPaise?: number,
    changePaise?: number
  ) => {
    if (activeOrder.items.length === 0) return;

    const completedOrder = completeOrderPayment(activeOrder, method, tenderedPaise, changePaise);

    // 1. Write to IndexedDB offline outbox FIRST (idempotent, offline-resilient)
    const outboxItems = completedOrder.items.map((it) => ({
      id: generateUUID(),
      order_id: completedOrder.id,
      menu_item_id: it.productId || null,
      product_name: it.productName,
      variant_label: it.variantLabel || null,
      addon_label: it.addOnLabel || null,
      quantity: it.quantity,
      unit_price_paise: it.unitPricePaise,
      addon_price_paise: 0,
      total_price_paise: it.lineTotalPaise,
    }));

    const outboxPayments = [
      {
        id: generateUUID(),
        order_id: completedOrder.id,
        method: method.toLowerCase() as 'cash' | 'upi' | 'card',
        amount_paise: completedOrder.totalPaise,
        created_at: completedOrder.completedAt || new Date().toISOString(),
      },
    ];

    const taxPaise = completedOrder.taxPreviewPaise;
    const cgstPaise = completedOrder.cgstPaise ?? Math.round(taxPaise / 2);
    const sgstPaise = completedOrder.sgstPaise ?? (taxPaise - cgstPaise);
    const seqNum = parseInt(completedOrder.token.replace(/\D/g, '') || '1', 10);

    saveCompletedOrderToOutbox({
      id: completedOrder.id,
      store_id: '00000000-0000-0000-0000-000000000001',
      terminal_id: '00000000-0000-0000-0000-000000000002',
      cashier_id: '00000000-0000-0000-0000-000000000003',
      token_terminal: 'T1',
      token_seq: seqNum,
      status: 'COMPLETED',
      subtotal_paise: completedOrder.subtotalPaise,
      discount_paise: completedOrder.discountPaise,
      discount_type: completedOrder.discount?.percent ? 'PERCENTAGE' : null,
      tax_paise: taxPaise,
      cgst_paise: cgstPaise,
      sgst_paise: sgstPaise,
      total_paise: completedOrder.totalPaise,
      client_completed_at: completedOrder.completedAt || new Date().toISOString(),
      business_date: completedOrder.businessDate || new Date().toISOString().split('T')[0],
      items: outboxItems,
      payments: outboxPayments,
    });

    // 2. Keep completed order in the active bar for 60 seconds (1-min auto reset)
    // and initialize next order token
    const nextSeq = seqNum + 1;
    const nextToken = `T1-${nextSeq.toString().padStart(3, '0')}`;
    const nextOrder = createNewPosOrder(nextToken);

    setOrders((prev) => {
      const otherOrders = prev.filter((o) => o.id !== activeOrder.id);
      return [...otherOrders, completedOrder, nextOrder];
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
                        onSelectCategory={(id) => {
                          setActiveCategoryId(id);
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

                        {/* Product Grid Area: INDEPENDENT VERTICAL SCROLLING */}
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                          <ProductGrid
                            items={displayedProducts}
                            onSelect={handleSelectProduct}
                            activeCategoryId={activeCategoryId}
                            searchQuery={searchQuery}
                            onClearSearch={() => setSearchQuery('')}
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
