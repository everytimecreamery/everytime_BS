'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  CategoryId,
  MenuItem,
} from '@/lib/mock/menu';
import {
  useStaffMenuCatalog,
  reconcileCartItemsWithCatalog,
} from '@/lib/pos/menuCatalog';
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
  recalculateOrderTotals,
  syncSessionTokenCounterFromOrders,
} from '@/lib/pos/order';
import { pushOrderToDatabase, classifySyncError } from '@/lib/supabase/orders';
import {
  addOrderToHistory,
  loadOrderHistory,
  markOrderSyncedInHistory,
  markOrderSyncFailedInHistory,
} from '@/lib/pos/orderHistory';
import { DiscountConfig, formatPaise } from '@/lib/pos/calculations';
import {
  getCurrentBillingSessionAction,
  startBillingSessionAction,
  stopBillingSessionAction,
  type TerminalBillingStatusSnapshot,
} from '@/app/actions/billing-sessions';
import { supabase } from '@/lib/supabase/client';
import { PosHeader } from './PosHeader';
import { BillingSessionBar } from './BillingSessionBar';
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
  const {
    categories: catalogCategories,
    items: catalogItems,
    catalogSource,
    getItemsByCategory,
    refreshCatalog,
  } = useStaffMenuCatalog();
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>('frequent');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Orders state: Multi-order session array (starts reliably at #001)
  const [orders, setOrders] = useState<PosOrder[]>(() => [createNewPosOrder()]);
  const [activeOrderId, setActiveOrderId] = useState<string>(() => orders[0]?.id || '');

  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const inFlightSyncIdsRef = useRef<Set<string>>(new Set());

  // Manual Billing Session & Sticky Cashier Operational Attribution State
  const [billingStatus, setBillingStatus] =
    useState<TerminalBillingStatusSnapshot | null>(null);
  const [billingStatusLoaded, setBillingStatusLoaded] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isBillingActionPending, setIsBillingActionPending] = useState(false);
  const [billingFeedback, setBillingFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [selectedStaffMemberId, setSelectedStaffMemberId] = useState<string>(
    () => {
      try {
        return localStorage.getItem('sticky_pos_cashier_v1') || '';
      } catch {
        return '';
      }
    }
  );

  const handleSelectStaffMember = useCallback((staffId: string) => {
    setSelectedStaffMemberId(staffId);
    try {
      if (staffId) {
        localStorage.setItem('sticky_pos_cashier_v1', staffId);
      } else {
        localStorage.removeItem('sticky_pos_cashier_v1');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const refreshBillingStatus = useCallback(async () => {
    setIsBillingLoading(true);
    try {
      const res = await getCurrentBillingSessionAction();
      if (res && res.success && res.data) {
        const snapshot = res.data;
        setBillingStatus(snapshot);
        setBillingStatusLoaded(true);

        const cashiers = snapshot.active_cashiers || [];
        setSelectedStaffMemberId((prev) => {
          let stored = prev;
          if (!stored) {
            try {
              stored = localStorage.getItem('sticky_pos_cashier_v1') || '';
            } catch {
              stored = '';
            }
          }
          if (stored && cashiers.some((c) => c.id === stored)) {
            return stored;
          }
          if (
            snapshot.active_session?.staff_member_id &&
            cashiers.some((c) => c.id === snapshot.active_session?.staff_member_id)
          ) {
            return snapshot.active_session.staff_member_id;
          }
          return cashiers[0]?.id || stored || '';
        });
      }
    } catch {
      // Unauthenticated or offline fallback
    } finally {
      setIsBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBillingStatus();
  }, [refreshBillingStatus]);

  // Realtime sync + polling fallback for billing_sessions changes
  useEffect(() => {
    const channel = (supabase as any)
      .channel('staff-billing-session-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_sessions' },
        () => {
          void refreshBillingStatus();
        }
      )
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [refreshBillingStatus]);

  const handleStartBilling = useCallback(async () => {
    if (isBillingActionPending) return;
    setIsBillingActionPending(true);
    setBillingFeedback(null);
    try {
      const res = await startBillingSessionAction({
        storeId: billingStatus?.store?.id || null,
        terminalId: billingStatus?.terminal?.id || null,
        staffMemberId: selectedStaffMemberId || null,
      });

      if (!res.success) {
        setBillingFeedback({
          type: 'error',
          message: res.error || 'Failed to start billing session.',
        });
        await refreshBillingStatus();
        return;
      }

      // Only update UI after authoritative server confirmation
      if (res.data) {
        setBillingStatus((prev) =>
          prev
            ? {
                ...prev,
                active: true,
                active_session: {
                  session_id: res.data.session_id,
                  store_id: res.data.store_id || prev.store.id,
                  terminal_id: res.data.terminal_id || prev.terminal.id,
                  staff_member_id:
                    res.data.staff_member_id ?? (selectedStaffMemberId || null),
                  staff_member_name: res.data.staff_member_name ?? null,
                  cashier_code: res.data.cashier_code ?? null,
                  started_at: res.data.started_at || new Date().toISOString(),
                  started_by: res.data.started_by || prev.actor.id,
                  started_by_name:
                    res.data.started_by_name || prev.actor.full_name,
                  status: 'ACTIVE',
                  order_count: Number(res.data.order_count ?? 0),
                  sales_total_paise: Number(res.data.sales_total_paise ?? 0),
                },
              }
            : prev
        );
        setBillingStatusLoaded(true);
      }
      await refreshBillingStatus();
      setBillingFeedback({
        type: 'success',
        message: 'Billing session started and confirmed by server.',
      });
    } catch (err: any) {
      setBillingFeedback({
        type: 'error',
        message: err?.message || 'Network error while starting billing session.',
      });
    } finally {
      setIsBillingActionPending(false);
    }
  }, [
    isBillingActionPending,
    billingStatus,
    selectedStaffMemberId,
    refreshBillingStatus,
  ]);

  const handleStopBilling = useCallback(
    async (stopReason?: string) => {
      if (isBillingActionPending) return;
      const sessionId = billingStatus?.active_session?.session_id;
      if (!sessionId) {
        setBillingFeedback({
          type: 'error',
          message: 'No active billing session found to stop.',
        });
        await refreshBillingStatus();
        return;
      }

      setIsBillingActionPending(true);
      setBillingFeedback(null);
      try {
        const res = await stopBillingSessionAction({
          sessionId,
          stopReason: stopReason || null,
        });

        if (!res.success) {
          setBillingFeedback({
            type: 'error',
            message: res.error || 'Failed to stop billing session.',
          });
          await refreshBillingStatus();
          return;
        }

        // Only update UI after authoritative server confirmation
        if (res.data) {
          setBillingStatus((prev) =>
            prev
              ? {
                  ...prev,
                  active: false,
                  previous_session: {
                    session_id: res.data.session_id || sessionId,
                    store_id: res.data.store_id || prev.store.id,
                    terminal_id: res.data.terminal_id || prev.terminal.id,
                    staff_member_id:
                      res.data.staff_member_id ??
                      prev.active_session?.staff_member_id ??
                      null,
                    staff_member_name:
                      res.data.staff_member_name ??
                      prev.active_session?.staff_member_name ??
                      null,
                    cashier_code:
                      res.data.cashier_code ??
                      prev.active_session?.cashier_code ??
                      null,
                    started_at:
                      res.data.started_at ||
                      prev.active_session?.started_at ||
                      new Date().toISOString(),
                    stopped_at: res.data.stopped_at || new Date().toISOString(),
                    started_by:
                      res.data.started_by ||
                      prev.active_session?.started_by ||
                      prev.actor.id,
                    started_by_name:
                      prev.active_session?.started_by_name ||
                      prev.actor.full_name,
                    stopped_by: res.data.stopped_by || prev.actor.id,
                    stopped_by_name:
                      res.data.stopped_by_name || prev.actor.full_name,
                    stop_reason: res.data.stop_reason || stopReason || null,
                    status: 'STOPPED',
                    order_count: Number(
                      res.data.order_count ??
                        prev.active_session?.order_count ??
                        0
                    ),
                    sales_total_paise: Number(
                      res.data.sales_total_paise ??
                        prev.active_session?.sales_total_paise ??
                        0
                    ),
                  },
                  active_session: null,
                }
              : prev
          );
          setBillingStatusLoaded(true);
        }
        await refreshBillingStatus();
        setBillingFeedback({
          type: 'success',
          message: 'Billing session stopped and confirmed by server.',
        });
      } catch (err: any) {
        setBillingFeedback({
          type: 'error',
          message: err?.message || 'Network error while stopping billing session.',
        });
      } finally {
        setIsBillingActionPending(false);
      }
    },
    [isBillingActionPending, billingStatus, refreshBillingStatus]
  );

  // 1. Rehydrate active processing tickets from localStorage on mount and advance token counter
  useEffect(() => {
    try {
      const history = loadOrderHistory();
      if (history.length > 0) {
        syncSessionTokenCounterFromOrders(history);
      }

      const saved = localStorage.getItem('active_pos_tickets_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tickets) && parsed.tickets.length > 0) {
          syncSessionTokenCounterFromOrders(parsed.tickets);
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
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [syncRequiresAuth, setSyncRequiresAuth] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() =>
    loadOrderHistory().filter(
      (o) => o.syncStatus === 'PENDING_SYNC' || o.syncStatus === 'SYNC_FAILED'
    ).length
  );
  const [isRetryingSync, setIsRetryingSync] = useState(false);

  const refreshSyncCounters = useCallback(() => {
    const history = loadOrderHistory();
    const unsynced = history.filter(
      (o) => o.syncStatus === 'PENDING_SYNC' || o.syncStatus === 'SYNC_FAILED'
    );
    setPendingSyncCount(unsynced.length);
    setSyncRequiresAuth(unsynced.some((o) => o.syncRequiresAuth));
  }, []);

  // Reconcile active PROCESSING drafts whenever authoritative Supabase catalog arrives
  useEffect(() => {
    if (catalogSource !== 'supabase' || catalogItems.length === 0) return;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.status !== 'PROCESSING' || order.items.length === 0) return order;
        const { reconciledItems, unresolvedItems, changed } = reconcileCartItemsWithCatalog(
          order.items,
          catalogItems
        );
        if (unresolvedItems.length > 0) {
          setCloudSyncError(unresolvedItems[0].reason);
          return order;
        }
        if (!changed) return order;
        const totals = recalculateOrderTotals(reconciledItems, order.discount, order.taxConfig);
        return {
          ...order,
          items: reconciledItems,
          ...totals,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, [catalogSource, catalogItems]);

  const syncSingleOrderToCloud = useCallback(
    async (
      orderToSync: PosOrder,
      method?: PaymentMethod,
      tenderedPaise?: number,
      changePaise?: number
    ): Promise<boolean> => {
      if (inFlightSyncIdsRef.current.has(orderToSync.id)) {
        return false;
      }

      inFlightSyncIdsRef.current.add(orderToSync.id);
      try {
        let preparedOrder = orderToSync;
        if (catalogSource === 'supabase' && catalogItems.length > 0) {
          const { reconciledItems, unresolvedItems, changed } = reconcileCartItemsWithCatalog(
            orderToSync.items,
            catalogItems
          );
          if (unresolvedItems.length > 0) {
            const msg = unresolvedItems.map((u) => u.reason).join(' ');
            markOrderSyncFailedInHistory(orderToSync.id, msg, 'validation');
            setCloudSyncError(msg);
            setSyncRequiresAuth(false);
            refreshSyncCounters();
            return false;
          }
          if (changed) {
            const totals = recalculateOrderTotals(
              reconciledItems,
              orderToSync.discount,
              orderToSync.taxConfig
            );
            preparedOrder = {
              ...orderToSync,
              items: reconciledItems,
              ...totals,
            };
          }
        }

        const effectiveMethod = method || preparedOrder.paymentMethod || 'CASH';
        const syncOptions =
          billingStatus?.terminal?.id || selectedStaffMemberId
            ? {
                terminalId: billingStatus?.terminal?.id || null,
                staffMemberId: selectedStaffMemberId || null,
              }
            : undefined;
        const res = await pushOrderToDatabase(
          preparedOrder,
          effectiveMethod,
          tenderedPaise ?? preparedOrder.tenderedPaise,
          changePaise ?? preparedOrder.changePaise,
          undefined,
          syncOptions
        );

        if (res.success) {
          markOrderSyncedInHistory(orderToSync.id, res.data);
          setCloudSyncError(null);
          setSyncRequiresAuth(false);
          refreshSyncCounters();
          if (billingStatusLoaded) {
            void refreshBillingStatus();
          }
          return true;
        }

        const errMsg = res.error || 'Failed to push order to database';
        const kind = classifySyncError(errMsg);
        markOrderSyncFailedInHistory(orderToSync.id, errMsg, kind);
        setCloudSyncError(errMsg);
        setSyncRequiresAuth(kind === 'auth_expired');
        refreshSyncCounters();
        if (
          /billing session inactive|billing is currently stopped/i.test(errMsg)
        ) {
          setBillingFeedback({
            type: 'error',
            message: errMsg,
          });
          void refreshBillingStatus();
        }
        return false;
      } catch (err: any) {
        const errMsg = err?.message || 'Unexpected cloud sync failure';
        const kind = classifySyncError(errMsg);
        markOrderSyncFailedInHistory(orderToSync.id, errMsg, kind);
        setCloudSyncError(errMsg);
        setSyncRequiresAuth(kind === 'auth_expired');
        refreshSyncCounters();
        return false;
      } finally {
        inFlightSyncIdsRef.current.delete(orderToSync.id);
      }
    },
    [
      catalogSource,
      catalogItems,
      refreshSyncCounters,
      billingStatus,
      selectedStaffMemberId,
      billingStatusLoaded,
      refreshBillingStatus,
    ]
  );

  const handleRetryPendingSync = useCallback(
    async (specificOrderId?: string): Promise<boolean> => {
      setIsRetryingSync(true);
      try {
        if (typeof navigator === 'undefined' || navigator.onLine) {
          await refreshCatalog();
        }
        const history = loadOrderHistory();
        const targets = specificOrderId
          ? history.filter((o) => o.id === specificOrderId && o.syncStatus !== 'SYNCED')
          : history.filter(
            (o) => o.syncStatus === 'PENDING_SYNC' || o.syncStatus === 'SYNC_FAILED'
          );

        let allOk = true;
        for (const ord of targets) {
          const ok = await syncSingleOrderToCloud(ord);
          if (!ok) allOk = false;
        }
        refreshSyncCounters();
        return allOk;
      } finally {
        setIsRetryingSync(false);
      }
    },
    [refreshCatalog, refreshSyncCounters, syncSingleOrderToCloud]
  );

  // Automatically retry pending / network-failed orders when connectivity returns
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      const history = loadOrderHistory();
      const hasRetryable = history.some(
        (o) =>
          o.syncStatus === 'PENDING_SYNC' ||
          (o.syncStatus === 'SYNC_FAILED' && o.syncErrorKind === 'network')
      );
      if (hasRetryable) {
        void handleRetryPendingSync();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [handleRetryPendingSync]);

  // Products for currently selected category (dynamic live catalog)
  const categoryProducts = useMemo(() => {
    return getItemsByCategory(activeCategoryId);
  }, [activeCategoryId, getItemsByCategory]);

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

  const handleOpenPaymentPreview = () => {
    if (billingStatusLoaded && !billingStatus?.active) {
      setBillingFeedback({
        type: 'error',
        message:
          'Billing is currently stopped. Click START BILLING before proceeding to payment.',
      });
      return;
    }
    setIsPaymentPreviewOpen(true);
  };

  // Workflow: Payment Confirmation (Completes active order locally as PENDING_SYNC and pushes through secure server-side checkout)
  const handleConfirmPayment = (
    method: PaymentMethod,
    tenderedPaise?: number,
    changePaise?: number
  ) => {
    if (activeOrder.items.length === 0) return;

    if (billingStatusLoaded && !billingStatus?.active) {
      setBillingFeedback({
        type: 'error',
        message:
          'Checkout rejected: Billing is currently stopped. Start a billing session first.',
      });
      setIsPaymentPreviewOpen(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const pendingOrder: PosOrder = {
      ...completeOrderPayment(activeOrder, method, tenderedPaise, changePaise),
      syncStatus: 'PENDING_SYNC',
      syncError: null,
      lastSyncAttemptAt: nowIso,
    };

    // 1. Persist locally with explicit PENDING_SYNC status (never falsely marked SYNCED before server confirmation)
    addOrderToHistory(pendingOrder);
    refreshSyncCounters();

    // 2. Push completed order through authenticated server-side checkout RPC
    setCloudSyncError(null);
    void syncSingleOrderToCloud(pendingOrder, method, tenderedPaise, changePaise);

    // 3. Clear from active queue and initialize next order token
    const nextOrder = createNewPosOrder();

    setOrders((prev) => {
      const otherOrders = prev.filter((o) => o.id !== activeOrder.id && o.status === 'PROCESSING');
      return [...otherOrders, nextOrder];
    });

    setActiveOrderId(nextOrder.id);
    setIsPaymentPreviewOpen(false);
  };

  const selectedCashierObj = useMemo(() => {
    const cashiers = billingStatus?.active_cashiers || [];
    return cashiers.find((c) => c.id === selectedStaffMemberId) || null;
  }, [billingStatus, selectedStaffMemberId]);

  const headerStaffName = useMemo(() => {
    if (selectedCashierObj) {
      return `${selectedCashierObj.full_name} (${selectedCashierObj.cashier_code})`;
    }
    if (billingStatus?.active_session?.staff_member_name) {
      const code = billingStatus.active_session.cashier_code;
      return `${billingStatus.active_session.staff_member_name}${code ? ` (${code})` : ''}`;
    }
    if (billingStatus?.actor?.full_name) {
      return billingStatus.actor.full_name;
    }
    return 'Alex M.';
  }, [selectedCashierObj, billingStatus]);

  return (
    <div className="h-full max-h-full flex flex-col gap-2 overflow-hidden select-none">
      {/* 1. Main POS Compact Header */}
      <PosHeader
        activeOrderToken={activeOrder.token}
        activeOrderStatus={activeOrder.status}
        onNewOrder={handleNewOrder}
        onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
        staffName={headerStaffName}
      />

      {/* 1B. Manual Billing Session Control Bar */}
      <BillingSessionBar
        billingStatus={billingStatus}
        isLoading={isBillingLoading}
        isActionPending={isBillingActionPending}
        selectedStaffMemberId={selectedStaffMemberId}
        onSelectStaffMember={handleSelectStaffMember}
        onStartBilling={handleStartBilling}
        onStopBilling={handleStopBilling}
        feedback={billingFeedback}
        onClearFeedback={() => setBillingFeedback(null)}
      />

      {/* 2. Order Management Area: Active Processing Orders Queue */}
      <OrderManagementBar
        orders={orders}
        activeOrderId={activeOrderId}
        onSelectOrder={handleSelectOrder}
      />

      {(cloudSyncError || pendingSyncCount > 0) && (
        <div
          role="alert"
          className={`shrink-0 px-3 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${syncRequiresAuth
            ? 'bg-red-50 border-red-200 text-red-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
        >
          <span className="flex-1 min-w-[200px]">
            {syncRequiresAuth ? (
              <>
                <strong>Session expired:</strong>{' '}
                {cloudSyncError || 'Please sign in again to sync pending orders.'}{' '}
                <a
                  href="/owner/login?redirect=/staff&error=session_expired"
                  className="underline font-bold ml-1"
                >
                  Sign In
                </a>
              </>
            ) : (
              <>
                <strong>Cloud checkout sync warning:</strong>{' '}
                {cloudSyncError || `${pendingSyncCount} local order(s) pending cloud confirmation.`}
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            {pendingSyncCount > 0 && (
              <button
                type="button"
                disabled={isRetryingSync}
                onClick={() => void handleRetryPendingSync()}
                className="px-2.5 py-1 rounded-lg bg-[#C43C1E] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                {isRetryingSync ? 'Syncing...' : `Retry Sync (${pendingSyncCount})`}
              </button>
            )}
            {cloudSyncError && (
              <button
                type="button"
                onClick={() => setCloudSyncError(null)}
                className="text-[11px] font-bold underline cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

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
            onOpenPaymentPreview={handleOpenPaymentPreview}
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
        onRetryOrderSync={handleRetryPendingSync}
      />
    </div>
  );
}
