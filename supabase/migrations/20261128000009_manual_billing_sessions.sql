-- =============================================================================
-- EVERYTIME CREAMERY — MANUAL BILLING SESSIONS & CHECKOUT ENFORCEMENT (MIGRATION 09)
-- Migration: 20261128000009_manual_billing_sessions.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Scope:
--   1. Dedicated public.billing_sessions table with single active session per terminal
--   2. Dedicated public.billing_session_events append-only audit trail
--   3. Foreign keys billing_session_id and staff_member_id on public.orders with immutability
--   4. Atomic start_billing_session(), stop_billing_session(), get_active_billing_session(),
--      get_terminal_billing_status(), and list_store_active_cashiers() RPCs
--   5. Hardened complete_pos_checkout() RPC enforcing active billing session requirement
--      and active employee operational attribution
--   6. Strict RLS policies: Staff scoped to assigned store; Owner full visibility;
--      Historical records immutable to staff.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BILLING SESSIONS TABLE & ACTIVE TERMINAL CONSTRAINT
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES public.terminals(id) ON DELETE RESTRICT,
    staff_member_id UUID REFERENCES public.staff_members(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    stopped_at TIMESTAMPTZ,
    started_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    stopped_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STOPPED')),
    stop_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT chk_stopped_at_valid CHECK (
        (status = 'ACTIVE' AND stopped_at IS NULL AND stopped_by IS NULL)
        OR
        (status = 'STOPPED' AND stopped_at IS NOT NULL AND stopped_by IS NOT NULL AND stopped_at >= started_at)
    )
);

-- Invariant: Exactly one ACTIVE billing session per terminal
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_sessions_unique_active_terminal
    ON public.billing_sessions (terminal_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_billing_sessions_store_status
    ON public.billing_sessions (store_id, status);

CREATE INDEX IF NOT EXISTS idx_billing_sessions_terminal_started
    ON public.billing_sessions (terminal_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_sessions_staff_member
    ON public.billing_sessions (staff_member_id);

-- -----------------------------------------------------------------------------
-- 2. APPEND-ONLY BILLING SESSION EVENTS AUDIT TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.billing_sessions(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES public.terminals(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('SESSION_STARTED', 'SESSION_STOPPED')),
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    staff_member_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_session_id
    ON public.billing_session_events (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_billing_events_terminal_created
    ON public.billing_session_events (terminal_id, created_at DESC);

-- Prevent manual mutation or deletion of audit events
CREATE OR REPLACE FUNCTION public.prevent_billing_event_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit violation: billing_session_events records are strictly immutable and append-only.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_billing_event_mutations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_billing_session_events_immutable ON public.billing_session_events;
CREATE TRIGGER trg_billing_session_events_immutable
    BEFORE UPDATE OR DELETE ON public.billing_session_events
    FOR EACH ROW
    EXECUTE PROCEDURE public.prevent_billing_event_mutations();

-- Prevent staff or direct callers from reopening or mutating historical STOPPED billing_sessions
CREATE OR REPLACE FUNCTION public.trg_protect_billing_sessions_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit violation: Billing sessions cannot be deleted.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'STOPPED' THEN
            RAISE EXCEPTION 'Audit violation: A stopped billing session cannot be restarted or modified. Create a new session instead.';
        END IF;

        IF OLD.id IS DISTINCT FROM NEW.id
           OR OLD.store_id IS DISTINCT FROM NEW.store_id
           OR OLD.terminal_id IS DISTINCT FROM NEW.terminal_id
           OR OLD.staff_member_id IS DISTINCT FROM NEW.staff_member_id
           OR OLD.started_at IS DISTINCT FROM NEW.started_at
           OR OLD.started_by IS DISTINCT FROM NEW.started_by
           OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'Audit violation: Core billing session start attributes are immutable.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_protect_billing_sessions_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_billing_sessions_integrity ON public.billing_sessions;
CREATE TRIGGER trg_protect_billing_sessions_integrity
    BEFORE UPDATE OR DELETE ON public.billing_sessions
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_protect_billing_sessions_integrity();

-- -----------------------------------------------------------------------------
-- 3. LINK ORDERS TO BILLING SESSIONS & OPERATIONAL STAFF MEMBER WITH IMMUTABILITY
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS billing_session_id UUID REFERENCES public.billing_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS staff_member_id UUID REFERENCES public.staff_members(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_orders_billing_session_id
    ON public.orders (billing_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_staff_member_id
    ON public.orders (staff_member_id);

-- Enforce billing_session_id and staff_member_id immutability once completed in trg_protect_orders_financial_integrity()
CREATE OR REPLACE FUNCTION public.trg_protect_orders_financial_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    user_id UUID;
    caller_role TEXT;
    current_paid BIGINT;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    IF TG_OP = 'INSERT' THEN
        -- Enforce non-null cashier attribution on all newly created orders
        IF NEW.cashier_id IS NULL THEN
            RAISE EXCEPTION 'Validation error: cashier_id is required and cannot be null.';
        END IF;

        IF jwt_role = 'authenticated' AND user_id IS NOT NULL THEN
            caller_role := public.get_user_role();
            IF caller_role = 'staff' AND NEW.cashier_id IS DISTINCT FROM user_id THEN
                RAISE EXCEPTION 'Unauthorized: Staff cannot create orders on behalf of another cashier.';
            END IF;
        END IF;

        IF NEW.status IN ('CANCELLED', 'VOID') THEN
            IF nullif(pg_catalog.btrim(COALESCE(NEW.cancelled_reason, '')), '') IS NULL THEN
                RAISE EXCEPTION 'Validation error: Cancellation or void reason is mandatory.';
            END IF;

            IF jwt_role IN ('authenticated', 'anon') THEN
                IF user_id IS NULL THEN
                    RAISE EXCEPTION 'Unauthorized: Order cancellation requires an authenticated actor.';
                END IF;
                NEW.cancelled_by := user_id;
            END IF;

            NEW.cancelled_at := pg_catalog.now();
        END IF;

        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE'
    IF OLD.status = 'COMPLETED' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RAISE EXCEPTION 'Financial audit violation: Completed orders cannot change status to %.', NEW.status;
        END IF;

        IF OLD.id IS DISTINCT FROM NEW.id
           OR OLD.store_id IS DISTINCT FROM NEW.store_id
           OR OLD.terminal_id IS DISTINCT FROM NEW.terminal_id
           OR OLD.cashier_id IS DISTINCT FROM NEW.cashier_id
           OR OLD.billing_session_id IS DISTINCT FROM NEW.billing_session_id
           OR OLD.staff_member_id IS DISTINCT FROM NEW.staff_member_id
           OR OLD.shift_id IS DISTINCT FROM NEW.shift_id
           OR OLD.token_terminal IS DISTINCT FROM NEW.token_terminal
           OR OLD.token_seq IS DISTINCT FROM NEW.token_seq
           OR OLD.subtotal_paise IS DISTINCT FROM NEW.subtotal_paise
           OR OLD.discount_paise IS DISTINCT FROM NEW.discount_paise
           OR OLD.discount_type IS DISTINCT FROM NEW.discount_type
           OR OLD.discount_reason IS DISTINCT FROM NEW.discount_reason
           OR OLD.discount_approved_by IS DISTINCT FROM NEW.discount_approved_by
           OR OLD.tax_paise IS DISTINCT FROM NEW.tax_paise
           OR OLD.cgst_paise IS DISTINCT FROM NEW.cgst_paise
           OR OLD.sgst_paise IS DISTINCT FROM NEW.sgst_paise
           OR OLD.total_paise IS DISTINCT FROM NEW.total_paise
           OR OLD.client_completed_at IS DISTINCT FROM NEW.client_completed_at
           OR OLD.server_received_at IS DISTINCT FROM NEW.server_received_at
           OR OLD.business_date IS DISTINCT FROM NEW.business_date
           OR OLD.cancelled_reason IS DISTINCT FROM NEW.cancelled_reason
           OR OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by
           OR OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at THEN
            RAISE EXCEPTION 'Financial audit violation: Finalized order totals and core attributes are immutable after completion.';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.status IN ('CANCELLED', 'VOID') THEN
        RAISE EXCEPTION 'Financial audit violation: Cancelled or voided orders are immutable.';
    END IF;

    -- OLD.status = 'PROCESSING' (pre-completion draft order)
    SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid
    FROM public.payments
    WHERE order_id = OLD.id;

    IF NEW.status IN ('CANCELLED', 'VOID') THEN
        IF current_paid > 0 THEN
            RAISE EXCEPTION 'Financial audit violation: Only unpaid orders can be cancelled or voided.';
        END IF;

        IF nullif(pg_catalog.btrim(COALESCE(NEW.cancelled_reason, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Validation error: Cancellation or void reason is mandatory.';
        END IF;

        IF jwt_role IN ('authenticated', 'anon') THEN
            IF user_id IS NULL THEN
                RAISE EXCEPTION 'Unauthorized: Order cancellation requires an authenticated actor.';
            END IF;
            NEW.cancelled_by := user_id;
        END IF;

        NEW.cancelled_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    IF NEW.total_paise < current_paid THEN
        RAISE EXCEPTION 'Financial audit violation: Order total (% paise) cannot be less than recorded payments (% paise).',
            NEW.total_paise, current_paid;
    END IF;

    IF NEW.cashier_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: cashier_id is required and cannot be null.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_protect_orders_financial_integrity() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. ATOMIC BILLING SESSION OPERATIONS: START, STOP, GET ACTIVE, STATUS, CASHIERS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_billing_session(
    p_store_id UUID,
    p_terminal_id UUID,
    p_staff_member_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_terminal RECORD;
    v_staff_member RECORD;
    v_existing_session RECORD;
    v_new_session_id UUID;
    v_now TIMESTAMPTZ;
BEGIN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Starting billing session requires an authenticated actor.';
    END IF;

    SELECT id, store_id, role, full_name, is_active
    INTO v_actor_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_actor_profile.is_active OR v_actor_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile is required to start billing.';
    END IF;

    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Store ID is required.';
    END IF;

    IF p_terminal_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Terminal ID is required.';
    END IF;

    -- Store authorization: staff can only operate their assigned store
    IF v_actor_profile.role = 'staff' AND v_actor_profile.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff member cannot start billing for another store.';
    END IF;

    -- Serialize concurrent operations on this terminal using advisory lock
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('billing_session_terminal_' || p_terminal_id::text));

    -- Validate terminal exists and belongs to the store
    SELECT id, store_id, terminal_number, device_name
    INTO v_terminal
    FROM public.terminals
    WHERE id = p_terminal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation error: Terminal % does not exist.', p_terminal_id;
    END IF;

    IF v_terminal.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Unauthorized: Terminal does not belong to specified store.';
    END IF;

    -- Check if an active session already exists for this terminal
    SELECT id, started_at, started_by, staff_member_id
    INTO v_existing_session
    FROM public.billing_sessions
    WHERE terminal_id = p_terminal_id
      AND status = 'ACTIVE'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'Conflict: Terminal already has an active billing session (session_id: %).', v_existing_session.id;
    END IF;

    -- Validate employee attribution if provided
    IF p_staff_member_id IS NOT NULL THEN
        SELECT id, store_id, full_name, cashier_code, is_active
        INTO v_staff_member
        FROM public.staff_members
        WHERE id = p_staff_member_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Staff member % does not exist.', p_staff_member_id;
        END IF;

        IF NOT v_staff_member.is_active THEN
            RAISE EXCEPTION 'Validation error: Selected staff member is inactive.';
        END IF;

        IF v_staff_member.store_id IS DISTINCT FROM p_store_id THEN
            RAISE EXCEPTION 'Unauthorized: Selected staff member does not belong to this store.';
        END IF;
    END IF;

    v_now := pg_catalog.now();
    v_new_session_id := gen_random_uuid();

    -- Create new session
    INSERT INTO public.billing_sessions (
        id,
        store_id,
        terminal_id,
        staff_member_id,
        started_at,
        stopped_at,
        started_by,
        stopped_by,
        status,
        stop_reason,
        created_at,
        updated_at
    ) VALUES (
        v_new_session_id,
        p_store_id,
        p_terminal_id,
        p_staff_member_id,
        v_now,
        NULL,
        v_actor_id,
        NULL,
        'ACTIVE',
        NULL,
        v_now,
        v_now
    );

    -- Log append-only audit event
    INSERT INTO public.billing_session_events (
        id,
        session_id,
        store_id,
        terminal_id,
        event_type,
        actor_id,
        staff_member_id,
        reason,
        metadata
    ) VALUES (
        gen_random_uuid(),
        v_new_session_id,
        p_store_id,
        p_terminal_id,
        'SESSION_STARTED',
        v_actor_id,
        p_staff_member_id,
        NULL,
        pg_catalog.jsonb_build_object(
            'actor_name', v_actor_profile.full_name,
            'staff_name', CASE WHEN p_staff_member_id IS NOT NULL THEN v_staff_member.full_name ELSE NULL END,
            'cashier_code', CASE WHEN p_staff_member_id IS NOT NULL THEN v_staff_member.cashier_code ELSE NULL END,
            'terminal_number', v_terminal.terminal_number
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'session_id', v_new_session_id,
        'store_id', p_store_id,
        'terminal_id', p_terminal_id,
        'status', 'ACTIVE',
        'started_at', v_now,
        'started_by', v_actor_id,
        'started_by_name', v_actor_profile.full_name,
        'staff_member_id', p_staff_member_id,
        'staff_member_name', CASE WHEN p_staff_member_id IS NOT NULL THEN v_staff_member.full_name ELSE NULL END,
        'cashier_code', CASE WHEN p_staff_member_id IS NOT NULL THEN v_staff_member.cashier_code ELSE NULL END,
        'order_count', 0,
        'sales_total_paise', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_billing_session(
    p_session_id UUID,
    p_stop_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_session RECORD;
    v_staff_member RECORD;
    v_now TIMESTAMPTZ;
    v_reason TEXT;
    v_order_count INT;
    v_sales_total BIGINT;
BEGIN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Stopping billing session requires an authenticated actor.';
    END IF;

    SELECT id, store_id, role, full_name, is_active
    INTO v_actor_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_actor_profile.is_active OR v_actor_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile is required to stop billing.';
    END IF;

    IF p_session_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Session ID is required.';
    END IF;

    -- Lock session record for update
    SELECT *
    INTO v_session
    FROM public.billing_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation error: Billing session % does not exist.', p_session_id;
    END IF;

    -- Serialize with terminal advisory lock as well so start/stop/checkout serialize cleanly
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('billing_session_terminal_' || v_session.terminal_id::text));

    IF v_session.status = 'STOPPED' THEN
        RAISE EXCEPTION 'Conflict: Billing session % is already stopped.', p_session_id;
    END IF;

    -- Store access authorization
    IF v_actor_profile.role = 'staff' AND v_actor_profile.store_id IS DISTINCT FROM v_session.store_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff member cannot stop billing for another store.';
    END IF;

    IF v_session.staff_member_id IS NOT NULL THEN
        SELECT full_name, cashier_code
        INTO v_staff_member
        FROM public.staff_members
        WHERE id = v_session.staff_member_id;
    END IF;

    v_now := pg_catalog.now();
    v_reason := nullif(pg_catalog.btrim(COALESCE(p_stop_reason, '')), '');

    UPDATE public.billing_sessions
    SET status = 'STOPPED',
        stopped_at = v_now,
        stopped_by = v_actor_id,
        stop_reason = v_reason,
        updated_at = v_now
    WHERE id = p_session_id;

    -- Gather session stats
    SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total_paise), 0)
    INTO v_order_count, v_sales_total
    FROM public.orders
    WHERE billing_session_id = p_session_id
      AND status = 'COMPLETED';

    -- Log append-only audit event
    INSERT INTO public.billing_session_events (
        id,
        session_id,
        store_id,
        terminal_id,
        event_type,
        actor_id,
        staff_member_id,
        reason,
        metadata
    ) VALUES (
        gen_random_uuid(),
        p_session_id,
        v_session.store_id,
        v_session.terminal_id,
        'SESSION_STOPPED',
        v_actor_id,
        v_session.staff_member_id,
        v_reason,
        pg_catalog.jsonb_build_object(
            'actor_name', v_actor_profile.full_name,
            'staff_name', CASE WHEN v_session.staff_member_id IS NOT NULL THEN v_staff_member.full_name ELSE NULL END,
            'cashier_code', CASE WHEN v_session.staff_member_id IS NOT NULL THEN v_staff_member.cashier_code ELSE NULL END,
            'duration_seconds', EXTRACT(EPOCH FROM (v_now - v_session.started_at))::INT,
            'order_count', v_order_count,
            'sales_total_paise', v_sales_total
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'store_id', v_session.store_id,
        'terminal_id', v_session.terminal_id,
        'status', 'STOPPED',
        'started_at', v_session.started_at,
        'stopped_at', v_now,
        'started_by', v_session.started_by,
        'stopped_by', v_actor_id,
        'stopped_by_name', v_actor_profile.full_name,
        'staff_member_id', v_session.staff_member_id,
        'staff_member_name', CASE WHEN v_session.staff_member_id IS NOT NULL THEN v_staff_member.full_name ELSE NULL END,
        'cashier_code', CASE WHEN v_session.staff_member_id IS NOT NULL THEN v_staff_member.cashier_code ELSE NULL END,
        'stop_reason', v_reason,
        'order_count', v_order_count,
        'sales_total_paise', v_sales_total
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_billing_session(
    p_terminal_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_terminal RECORD;
    v_session RECORD;
    v_order_count INT;
    v_sales_total BIGINT;
BEGIN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required.';
    END IF;

    SELECT id, store_id, role, is_active
    INTO v_actor_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_actor_profile.is_active OR v_actor_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile required.';
    END IF;

    SELECT id, store_id
    INTO v_terminal
    FROM public.terminals
    WHERE id = p_terminal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation error: Terminal % does not exist.', p_terminal_id;
    END IF;

    IF v_actor_profile.role = 'staff' AND v_actor_profile.store_id IS DISTINCT FROM v_terminal.store_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot view billing session for another store.';
    END IF;

    SELECT s.*, sm.full_name AS staff_name, sm.cashier_code AS code, p.full_name AS starter_name
    INTO v_session
    FROM public.billing_sessions s
    LEFT JOIN public.staff_members sm ON sm.id = s.staff_member_id
    LEFT JOIN public.profiles p ON p.id = s.started_by
    WHERE s.terminal_id = p_terminal_id
      AND s.status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('active', false);
    END IF;

    SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total_paise), 0)
    INTO v_order_count, v_sales_total
    FROM public.orders
    WHERE billing_session_id = v_session.id
      AND status = 'COMPLETED';

    RETURN pg_catalog.jsonb_build_object(
        'active', true,
        'session_id', v_session.id,
        'store_id', v_session.store_id,
        'terminal_id', v_session.terminal_id,
        'staff_member_id', v_session.staff_member_id,
        'staff_member_name', v_session.staff_name,
        'cashier_code', v_session.code,
        'started_at', v_session.started_at,
        'started_by', v_session.started_by,
        'started_by_name', v_session.starter_name,
        'status', v_session.status,
        'order_count', v_order_count,
        'sales_total_paise', v_sales_total
    );
END;
$$;

-- Returns minimal operational attribution list (id, full_name, cashier_code, store_id)
-- without exposing employee email/phone PII or opening direct SELECT on staff_members to staff
CREATE OR REPLACE FUNCTION public.list_store_active_cashiers(
    p_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_target_store_id UUID;
    v_result JSONB;
BEGIN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required.';
    END IF;

    SELECT id, store_id, role, is_active
    INTO v_actor_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_actor_profile.is_active OR v_actor_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile required.';
    END IF;

    IF v_actor_profile.role = 'staff' THEN
        IF p_store_id IS NOT NULL AND p_store_id IS DISTINCT FROM v_actor_profile.store_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot list employees for another store.';
        END IF;
        v_target_store_id := v_actor_profile.store_id;
    ELSE
        v_target_store_id := COALESCE(p_store_id, v_actor_profile.store_id);
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', sm.id,
                'full_name', sm.full_name,
                'cashier_code', sm.cashier_code,
                'store_id', sm.store_id,
                'is_active', sm.is_active
            )
            ORDER BY sm.full_name ASC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.staff_members sm
    WHERE sm.is_active = true
      AND (v_target_store_id IS NULL OR sm.store_id = v_target_store_id);

    RETURN v_result;
END;
$$;

-- Authoritative terminal billing status snapshot for Staff Portal
CREATE OR REPLACE FUNCTION public.get_terminal_billing_status(
    p_terminal_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_terminal RECORD;
    v_store RECORD;
    v_active_session RECORD;
    v_prev_session RECORD;
    v_active_orders INT := 0;
    v_active_sales BIGINT := 0;
    v_prev_orders INT := 0;
    v_prev_sales BIGINT := 0;
    v_cashiers JSONB := '[]'::jsonb;
BEGIN
    v_actor_id := (SELECT auth.uid());
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required.';
    END IF;

    SELECT id, store_id, role, full_name, cashier_code, is_active
    INTO v_actor_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_actor_profile.is_active OR v_actor_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile required.';
    END IF;

    IF p_terminal_id IS NULL THEN
        SELECT id, store_id, terminal_number, device_name
        INTO v_terminal
        FROM public.terminals
        WHERE store_id = v_actor_profile.store_id
        ORDER BY created_at ASC
        LIMIT 1;
    ELSE
        SELECT id, store_id, terminal_number, device_name
        INTO v_terminal
        FROM public.terminals
        WHERE id = p_terminal_id;
    END IF;

    IF NOT FOUND OR v_terminal.id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Terminal not found for store.';
    END IF;

    IF v_actor_profile.role = 'staff' AND v_terminal.store_id IS DISTINCT FROM v_actor_profile.store_id THEN
        RAISE EXCEPTION 'Unauthorized: Terminal does not belong to your assigned store.';
    END IF;

    SELECT id, name
    INTO v_store
    FROM public.stores
    WHERE id = v_terminal.store_id;

    -- Active session
    SELECT s.*, sm.full_name AS staff_name, sm.cashier_code AS code, p.full_name AS starter_name
    INTO v_active_session
    FROM public.billing_sessions s
    LEFT JOIN public.staff_members sm ON sm.id = s.staff_member_id
    LEFT JOIN public.profiles p ON p.id = s.started_by
    WHERE s.terminal_id = v_terminal.id
      AND s.status = 'ACTIVE'
    LIMIT 1;

    IF FOUND THEN
        SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total_paise), 0)
        INTO v_active_orders, v_active_sales
        FROM public.orders
        WHERE billing_session_id = v_active_session.id
          AND status = 'COMPLETED';
    END IF;

    -- Most recent stopped session
    SELECT s.*, sm.full_name AS staff_name, sm.cashier_code AS code,
           p1.full_name AS starter_name, p2.full_name AS stopper_name
    INTO v_prev_session
    FROM public.billing_sessions s
    LEFT JOIN public.staff_members sm ON sm.id = s.staff_member_id
    LEFT JOIN public.profiles p1 ON p1.id = s.started_by
    LEFT JOIN public.profiles p2 ON p2.id = s.stopped_by
    WHERE s.terminal_id = v_terminal.id
      AND s.status = 'STOPPED'
    ORDER BY s.stopped_at DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total_paise), 0)
        INTO v_prev_orders, v_prev_sales
        FROM public.orders
        WHERE billing_session_id = v_prev_session.id
          AND status = 'COMPLETED';
    END IF;

    v_cashiers := public.list_store_active_cashiers(v_terminal.store_id);

    RETURN pg_catalog.jsonb_build_object(
        'server_now', pg_catalog.now(),
        'store', pg_catalog.jsonb_build_object(
            'id', v_store.id,
            'name', v_store.name
        ),
        'terminal', pg_catalog.jsonb_build_object(
            'id', v_terminal.id,
            'store_id', v_terminal.store_id,
            'terminal_number', v_terminal.terminal_number,
            'device_name', v_terminal.device_name
        ),
        'actor', pg_catalog.jsonb_build_object(
            'id', v_actor_profile.id,
            'full_name', v_actor_profile.full_name,
            'role', v_actor_profile.role,
            'cashier_code', v_actor_profile.cashier_code
        ),
        'active', v_active_session.id IS NOT NULL,
        'active_session', CASE
            WHEN v_active_session.id IS NOT NULL THEN pg_catalog.jsonb_build_object(
                'session_id', v_active_session.id,
                'store_id', v_active_session.store_id,
                'terminal_id', v_active_session.terminal_id,
                'staff_member_id', v_active_session.staff_member_id,
                'staff_member_name', v_active_session.staff_name,
                'cashier_code', v_active_session.code,
                'started_at', v_active_session.started_at,
                'started_by', v_active_session.started_by,
                'started_by_name', v_active_session.starter_name,
                'status', 'ACTIVE',
                'order_count', v_active_orders,
                'sales_total_paise', v_active_sales
            )
            ELSE NULL
        END,
        'previous_session', CASE
            WHEN v_prev_session.id IS NOT NULL THEN pg_catalog.jsonb_build_object(
                'session_id', v_prev_session.id,
                'store_id', v_prev_session.store_id,
                'terminal_id', v_prev_session.terminal_id,
                'staff_member_id', v_prev_session.staff_member_id,
                'staff_member_name', v_prev_session.staff_name,
                'cashier_code', v_prev_session.code,
                'started_at', v_prev_session.started_at,
                'stopped_at', v_prev_session.stopped_at,
                'started_by', v_prev_session.started_by,
                'started_by_name', v_prev_session.starter_name,
                'stopped_by', v_prev_session.stopped_by,
                'stopped_by_name', v_prev_session.stopper_name,
                'stop_reason', v_prev_session.stop_reason,
                'status', 'STOPPED',
                'order_count', v_prev_orders,
                'sales_total_paise', v_prev_sales
            )
            ELSE NULL
        END,
        'active_cashiers', v_cashiers
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. HARDENED CHECKOUT RPC ENFORCING ACTIVE BILLING SESSION & STAFF ATTRIBUTION
-- -----------------------------------------------------------------------------

-- Drop previous 14-parameter overload so PostgREST resolves the 15-parameter version unambiguously
DROP FUNCTION IF EXISTS public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
);

CREATE OR REPLACE FUNCTION public.complete_pos_checkout(
    p_order_id UUID,
    p_terminal_id UUID DEFAULT NULL,
    p_token_terminal TEXT DEFAULT 'T1',
    p_token_seq INT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_type TEXT DEFAULT NULL,
    p_discount_reason TEXT DEFAULT NULL,
    p_payments JSONB DEFAULT '[]'::jsonb,
    p_client_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_business_date DATE DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_expected_subtotal_paise BIGINT DEFAULT NULL,
    p_expected_total_paise BIGINT DEFAULT NULL,
    p_staff_member_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_jwt_role TEXT;
    v_actor_id UUID;
    v_profile RECORD;
    v_store_id UUID;
    v_terminal RECORD;
    v_billing_session RECORD;
    v_resolved_staff_member_id UUID;
    v_staff_member RECORD;
    v_existing_order public.orders%ROWTYPE;
    v_token_terminal TEXT;
    v_token_seq INT;
    v_completed_at TIMESTAMPTZ;
    v_business_date DATE;
    v_discount_percent NUMERIC;
    v_discount_type TEXT;

    v_item JSONB;
    v_menu_item_id TEXT;
    v_variant_id TEXT;
    v_addon_id TEXT;
    v_qty_raw TEXT;
    v_quantity INT;
    v_expected_unit_raw TEXT;
    v_expected_unit_price BIGINT;

    v_db_item public.menu_items%ROWTYPE;
    v_cat_active BOOLEAN;
    v_cat_archived BOOLEAN;
    v_db_variant public.menu_variants%ROWTYPE;
    v_db_addon public.menu_addons%ROWTYPE;
    v_has_active_variants BOOLEAN;

    v_unit_price_paise BIGINT;
    v_addon_price_paise BIGINT;
    v_effective_unit_paise BIGINT;
    v_variant_label TEXT;
    v_addon_label TEXT;
    v_line_total_paise BIGINT;

    v_resolved_items JSONB := '[]'::jsonb;
    v_subtotal_paise BIGINT := 0;
    v_discount_paise BIGINT := 0;
    v_discounted_subtotal BIGINT := 0;
    v_tax_paise BIGINT := 0;
    v_cgst_paise BIGINT := 0;
    v_sgst_paise BIGINT := 0;
    v_total_paise BIGINT := 0;

    v_pay JSONB;
    v_pay_method TEXT;
    v_pay_amount_raw TEXT;
    v_pay_amount BIGINT;
    v_pay_utr TEXT;
    v_payment_sum BIGINT := 0;
BEGIN
    -- 1. Strict Active Cashier Authentication & Anti-Impersonation
    v_jwt_role := (SELECT auth.role());
    v_actor_id := (SELECT auth.uid());

    IF v_actor_id IS NULL OR v_jwt_role IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: POS checkout requires a valid authenticated cashier session.';
    END IF;

    IF p_cashier_id IS NOT NULL AND p_cashier_id IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Unauthorized: Cashier impersonation denied.';
    END IF;

    SELECT id, store_id, role, full_name, is_active
    INTO v_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_profile.is_active OR v_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile is required for POS checkout.';
    END IF;

    IF v_profile.store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Cashier profile is not assigned to a store.';
    END IF;

    v_store_id := v_profile.store_id;

    -- 2. Validate Order ID, Timestamp, Discount (< 100%) & Basic Payload Shape
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Order ID is required.';
    END IF;

    IF p_client_completed_at IS NOT NULL AND p_client_completed_at > (pg_catalog.now() + INTERVAL '15 minutes') THEN
        RAISE EXCEPTION 'Validation error: Client completion timestamp cannot be in the future.';
    END IF;

    v_discount_percent := COALESCE(p_discount_percent, 0);
    IF NOT (v_discount_percent >= 0 AND v_discount_percent < 100) THEN
        RAISE EXCEPTION 'Validation error: Discount percentage must be >= 0 and less than 100 (100%% complimentary orders are not supported).';
    END IF;

    v_discount_type := CASE
        WHEN v_discount_percent > 0 THEN COALESCE(nullif(pg_catalog.btrim(p_discount_type), ''), 'PERCENTAGE')
        ELSE NULL
    END;

    IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Validation error: Checkout requires at least one order item.';
    END IF;

    IF pg_catalog.jsonb_array_length(p_items) > 200 THEN
        RAISE EXCEPTION 'Validation error: Order cannot exceed 200 line items.';
    END IF;

    IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
        RAISE EXCEPTION 'Payment validation failed: At least one payment tender is required.';
    END IF;

    IF pg_catalog.jsonb_array_length(p_payments) > 20 THEN
        RAISE EXCEPTION 'Payment validation failed: Too many split payment tenders.';
    END IF;

    -- Parse and validate payment tenders up front
    FOR v_pay IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payments)
    LOOP
        IF pg_catalog.jsonb_typeof(v_pay) <> 'object' THEN
            RAISE EXCEPTION 'Payment validation failed: Each payment tender must be a JSON object.';
        END IF;

        v_pay_method := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_pay->>'method', '')));
        IF v_pay_method NOT IN ('cash', 'upi', 'card') THEN
            RAISE EXCEPTION 'Payment validation failed: Invalid payment method "%".', v_pay->>'method';
        END IF;

        v_pay_amount_raw := pg_catalog.btrim(COALESCE(v_pay->>'amount_paise', ''));
        IF v_pay_amount_raw !~ '^[0-9]+$' OR pg_catalog.char_length(v_pay_amount_raw) > 12 THEN
            RAISE EXCEPTION 'Payment validation failed: Payment amount must be a valid positive integer in paise.';
        END IF;

        v_pay_amount := v_pay_amount_raw::BIGINT;
        IF v_pay_amount <= 0 THEN
            RAISE EXCEPTION 'Payment validation failed: Payment amount must be greater than zero.';
        END IF;

        v_payment_sum := v_payment_sum + v_pay_amount;
    END LOOP;

    -- 3. Serialize Concurrent Requests for the Same Order ID & Check Idempotency Early
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pos_checkout_order_' || p_order_id::text));

    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_order.store_id IS DISTINCT FROM v_store_id
           OR v_existing_order.cashier_id IS DISTINCT FROM v_actor_id THEN
            RAISE EXCEPTION 'Unauthorized: Order ID % belongs to another store or cashier.', p_order_id;
        END IF;

        IF v_existing_order.status = 'COMPLETED' THEN
            IF p_expected_subtotal_paise IS NOT NULL AND p_expected_subtotal_paise IS DISTINCT FROM v_existing_order.subtotal_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order subtotal does not match submitted payload.';
            END IF;

            IF p_expected_total_paise IS NOT NULL AND p_expected_total_paise IS DISTINCT FROM v_existing_order.total_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order total does not match submitted payload.';
            END IF;

            IF v_payment_sum IS DISTINCT FROM v_existing_order.total_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order total does not match submitted payload.';
            END IF;

            RETURN pg_catalog.jsonb_build_object(
                'order_id', v_existing_order.id,
                'cashier_id', v_existing_order.cashier_id,
                'staff_member_id', v_existing_order.staff_member_id,
                'store_id', v_existing_order.store_id,
                'terminal_id', v_existing_order.terminal_id,
                'billing_session_id', v_existing_order.billing_session_id,
                'token_terminal', v_existing_order.token_terminal,
                'token_seq', v_existing_order.token_seq,
                'status', v_existing_order.status,
                'subtotal_paise', v_existing_order.subtotal_paise,
                'discount_paise', v_existing_order.discount_paise,
                'tax_paise', v_existing_order.tax_paise,
                'cgst_paise', v_existing_order.cgst_paise,
                'sgst_paise', v_existing_order.sgst_paise,
                'total_paise', v_existing_order.total_paise,
                'idempotent', true
            );
        END IF;

        RAISE EXCEPTION 'Financial audit violation: Order ID % already exists with status %.', p_order_id, v_existing_order.status;
    END IF;

    -- 4. Validate Terminal Ownership & Lock Terminal for Sequential Token Assignment
    IF p_terminal_id IS NULL THEN
        SELECT id, store_id INTO v_terminal
        FROM public.terminals
        WHERE store_id = v_store_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: No terminal registered for store %.', v_store_id;
        END IF;
    ELSE
        SELECT id, store_id INTO v_terminal
        FROM public.terminals
        WHERE id = p_terminal_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Terminal % does not exist.', p_terminal_id;
        END IF;

        IF v_terminal.store_id IS DISTINCT FROM v_store_id THEN
            RAISE EXCEPTION 'Unauthorized: Terminal % does not belong to cashier''s assigned store.', p_terminal_id;
        END IF;
    END IF;

    -- 4B. ENFORCE ACTIVE BILLING SESSION REQUIREMENT & SERIALIZE AGAINST STOP REQUESTS
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('billing_session_terminal_' || v_terminal.id::text));

    SELECT id, store_id, terminal_id, staff_member_id, status
    INTO v_billing_session
    FROM public.billing_sessions
    WHERE terminal_id = v_terminal.id
      AND status = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing session inactive: Billing is currently STOPPED for terminal %. Staff must start a manual billing session before processing orders.',
            v_terminal.id;
    END IF;

    IF v_billing_session.store_id IS DISTINCT FROM v_store_id THEN
        RAISE EXCEPTION 'Unauthorized: Active billing session does not match store %.', v_store_id;
    END IF;

    -- 4C. VALIDATE SELECTED ACTIVE EMPLOYEE FOR OPERATIONAL ATTRIBUTION
    v_resolved_staff_member_id := COALESCE(p_staff_member_id, v_billing_session.staff_member_id);

    IF v_resolved_staff_member_id IS NOT NULL THEN
        SELECT id, store_id, full_name, cashier_code, is_active
        INTO v_staff_member
        FROM public.staff_members
        WHERE id = v_resolved_staff_member_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Selected staff member % does not exist.', v_resolved_staff_member_id;
        END IF;

        IF NOT v_staff_member.is_active THEN
            RAISE EXCEPTION 'Validation error: Selected staff member is inactive and cannot process orders.';
        END IF;

        IF v_staff_member.store_id IS DISTINCT FROM v_store_id THEN
            RAISE EXCEPTION 'Unauthorized: Selected staff member does not belong to this store.';
        END IF;
    END IF;

    -- 5. Validate Items & Compute Authoritative Database Prices
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Validation error: Each item must be a JSON object.';
        END IF;

        v_menu_item_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'menu_item_id', '')), '');
        v_variant_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'variant_id', '')), '');
        v_addon_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'addon_id', '')), '');
        v_qty_raw := pg_catalog.btrim(COALESCE(v_item->>'quantity', ''));

        IF v_menu_item_id IS NULL THEN
            RAISE EXCEPTION 'Validation error: Each item must include menu_item_id.';
        END IF;

        IF v_qty_raw !~ '^[0-9]+$' OR pg_catalog.char_length(v_qty_raw) > 6 THEN
            RAISE EXCEPTION 'Validation error: Item quantity must be a positive integer within allowed bounds.';
        END IF;

        v_quantity := v_qty_raw::INT;
        IF v_quantity <= 0 OR v_quantity > 10000 THEN
            RAISE EXCEPTION 'Validation error: Item quantity must be between 1 and 10000.';
        END IF;

        v_expected_unit_raw := nullif(pg_catalog.btrim(COALESCE(v_item->>'expected_unit_price_paise', '')), '');
        IF v_expected_unit_raw IS NOT NULL THEN
            IF v_expected_unit_raw !~ '^-?[0-9]+$' OR pg_catalog.char_length(v_expected_unit_raw) > 12 THEN
                RAISE EXCEPTION 'Validation error: Invalid expected unit price format.';
            END IF;
            v_expected_unit_price := v_expected_unit_raw::BIGINT;
        ELSE
            v_expected_unit_price := NULL;
        END IF;

        SELECT * INTO v_db_item
        FROM public.menu_items
        WHERE id = v_menu_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" does not exist.', v_menu_item_id;
        END IF;

        IF v_db_item.is_archived THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" is archived and cannot be ordered.', v_db_item.name;
        END IF;

        IF NOT v_db_item.is_available THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" is currently marked unavailable.', v_db_item.name;
        END IF;

        SELECT is_active, is_archived INTO v_cat_active, v_cat_archived
        FROM public.categories
        WHERE id = v_db_item.category_id;

        IF NOT FOUND OR v_cat_archived OR NOT v_cat_active THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" belongs to an inactive or archived category.', v_db_item.name;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.menu_variants
            WHERE menu_item_id = v_db_item.id
              AND is_archived = false
        ) INTO v_has_active_variants;

        IF v_variant_id IS NOT NULL THEN
            SELECT * INTO v_db_variant
            FROM public.menu_variants
            WHERE id = v_variant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Validation error: Variant "%" does not exist for menu item "%".', v_variant_id, v_db_item.name;
            END IF;

            IF v_db_variant.menu_item_id IS DISTINCT FROM v_db_item.id THEN
                RAISE EXCEPTION 'Validation error: Variant "%" belongs to a different menu item.', v_variant_id;
            END IF;

            IF v_db_variant.is_archived THEN
                RAISE EXCEPTION 'Validation error: Variant "%" is archived.', v_db_variant.label;
            END IF;

            v_unit_price_paise := v_db_variant.price_paise;
            v_variant_label := v_db_variant.label;
        ELSE
            IF v_has_active_variants THEN
                RAISE EXCEPTION 'Validation error: Menu item "%" requires variant selection.', v_db_item.name;
            END IF;

            v_unit_price_paise := v_db_item.base_price_paise;
            v_variant_label := NULL;
        END IF;

        IF v_addon_id IS NOT NULL THEN
            SELECT * INTO v_db_addon
            FROM public.menu_addons
            WHERE id = v_addon_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Validation error: Addon "%" does not exist.', v_addon_id;
            END IF;

            IF v_db_addon.is_archived THEN
                RAISE EXCEPTION 'Validation error: Addon "%" is archived.', v_db_addon.name;
            END IF;

            IF NOT v_db_addon.is_available THEN
                RAISE EXCEPTION 'Validation error: Addon "%" is currently unavailable.', v_db_addon.name;
            END IF;

            v_addon_price_paise := v_db_addon.price_paise;
            v_addon_label := v_db_addon.name;
        ELSE
            v_addon_price_paise := 0;
            v_addon_label := NULL;
        END IF;

        v_effective_unit_paise := v_unit_price_paise + v_addon_price_paise;

        IF v_expected_unit_price IS NOT NULL AND v_expected_unit_price IS DISTINCT FROM v_effective_unit_paise THEN
            RAISE EXCEPTION 'Price manipulation rejected: Unit price for "%" has changed or was manipulated (expected % paise, database price % paise).',
                v_db_item.name, v_expected_unit_price, v_effective_unit_paise;
        END IF;

        v_line_total_paise := v_effective_unit_paise * v_quantity;
        v_subtotal_paise := v_subtotal_paise + v_line_total_paise;

        v_resolved_items := v_resolved_items || pg_catalog.jsonb_build_object(
            'menu_item_id', v_db_item.id,
            'product_name', v_db_item.name,
            'variant_label', v_variant_label,
            'addon_label', v_addon_label,
            'quantity', v_quantity,
            'unit_price_paise', v_unit_price_paise,
            'addon_price_paise', v_addon_price_paise,
            'total_price_paise', v_line_total_paise
        );
    END LOOP;

    -- 6. Enforce Subtotal & Discount Integrity
    IF p_expected_subtotal_paise IS NOT NULL AND p_expected_subtotal_paise IS DISTINCT FROM v_subtotal_paise THEN
        RAISE EXCEPTION 'Subtotal manipulation rejected: Computed subtotal (% paise) does not match payload subtotal (% paise).',
            v_subtotal_paise, p_expected_subtotal_paise;
    END IF;

    IF v_discount_percent > 0 THEN
        v_discount_paise := (v_subtotal_paise * v_discount_percent / 100)::BIGINT;
    ELSE
        v_discount_paise := 0;
    END IF;

    v_discounted_subtotal := v_subtotal_paise - v_discount_paise;

    -- 7. Deterministic Indian GST Invariant (5% Total GST -> 2.5% CGST + 2.5% SGST)
    v_tax_paise := (v_discounted_subtotal * 5 / 100)::BIGINT;
    v_cgst_paise := v_tax_paise / 2;
    v_sgst_paise := v_tax_paise - v_cgst_paise;
    v_total_paise := v_discounted_subtotal + v_tax_paise;

    IF v_total_paise <= 0 THEN
        RAISE EXCEPTION 'Validation error: Order total must be greater than zero.';
    END IF;

    IF p_expected_total_paise IS NOT NULL AND p_expected_total_paise IS DISTINCT FROM v_total_paise THEN
        RAISE EXCEPTION 'Total manipulation rejected: Authoritative order total (% paise) does not match submitted total (% paise).',
            v_total_paise, p_expected_total_paise;
    END IF;

    IF v_payment_sum IS DISTINCT FROM v_total_paise THEN
        RAISE EXCEPTION 'Payment validation failed: Tendered payment total % paise does not match authoritative order total % paise.',
            v_payment_sum, v_total_paise;
    END IF;

    -- 8. Resolve Token Metadata & Business Date
    v_completed_at := COALESCE(p_client_completed_at, pg_catalog.now());
    v_business_date := COALESCE(p_business_date, (v_completed_at AT TIME ZONE 'UTC')::DATE);
    v_token_terminal := COALESCE(nullif(pg_catalog.btrim(p_token_terminal), ''), 'T1');

    IF p_token_seq IS NOT NULL AND p_token_seq > 0 THEN
        IF EXISTS (
            SELECT 1 FROM public.orders
            WHERE terminal_id = v_terminal.id
              AND business_date = v_business_date
              AND token_seq = p_token_seq
        ) THEN
            SELECT COALESCE(MAX(token_seq), 0) + 1 INTO v_token_seq
            FROM public.orders
            WHERE terminal_id = v_terminal.id
              AND business_date = v_business_date;
        ELSE
            v_token_seq := p_token_seq;
        END IF;
    ELSE
        SELECT COALESCE(MAX(token_seq), 0) + 1 INTO v_token_seq
        FROM public.orders
        WHERE terminal_id = v_terminal.id
          AND business_date = v_business_date;
    END IF;

    -- 9. Atomic Insert: Orders (with billing_session_id & staff_member_id) -> Order Items -> Payments
    PERFORM pg_catalog.set_config('app.checkout_rpc', 'true', true);

    INSERT INTO public.orders (
        id,
        store_id,
        terminal_id,
        cashier_id,
        billing_session_id,
        staff_member_id,
        token_terminal,
        token_seq,
        status,
        subtotal_paise,
        discount_paise,
        discount_type,
        discount_reason,
        discount_approved_by,
        tax_paise,
        cgst_paise,
        sgst_paise,
        total_paise,
        client_completed_at,
        business_date
    ) VALUES (
        p_order_id,
        v_store_id,
        v_terminal.id,
        v_actor_id,
        v_billing_session.id,
        v_resolved_staff_member_id,
        v_token_terminal,
        v_token_seq,
        'COMPLETED',
        v_subtotal_paise,
        v_discount_paise,
        v_discount_type,
        nullif(pg_catalog.btrim(COALESCE(p_discount_reason, '')), ''),
        NULL,
        v_tax_paise,
        v_cgst_paise,
        v_sgst_paise,
        v_total_paise,
        v_completed_at,
        v_business_date
    );

    INSERT INTO public.order_items (
        id,
        order_id,
        menu_item_id,
        product_name,
        variant_label,
        addon_label,
        quantity,
        unit_price_paise,
        addon_price_paise,
        total_price_paise
    )
    SELECT
        gen_random_uuid(),
        p_order_id,
        ri->>'menu_item_id',
        ri->>'product_name',
        ri->>'variant_label',
        ri->>'addon_label',
        (ri->>'quantity')::INT,
        (ri->>'unit_price_paise')::BIGINT,
        (ri->>'addon_price_paise')::BIGINT,
        (ri->>'total_price_paise')::BIGINT
    FROM pg_catalog.jsonb_array_elements(v_resolved_items) ri;

    FOR v_pay IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payments)
    LOOP
        v_pay_method := pg_catalog.lower(pg_catalog.btrim(v_pay->>'method'));
        v_pay_amount := (v_pay->>'amount_paise')::BIGINT;
        v_pay_utr := nullif(pg_catalog.btrim(COALESCE(v_pay->>'upi_utr', '')), '');

        INSERT INTO public.payments (
            id,
            order_id,
            method,
            amount_paise,
            upi_utr,
            created_at
        ) VALUES (
            gen_random_uuid(),
            p_order_id,
            v_pay_method,
            v_pay_amount,
            v_pay_utr,
            v_completed_at
        );
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'order_id', p_order_id,
        'cashier_id', v_actor_id,
        'staff_member_id', v_resolved_staff_member_id,
        'store_id', v_store_id,
        'terminal_id', v_terminal.id,
        'billing_session_id', v_billing_session.id,
        'token_terminal', v_token_terminal,
        'token_seq', v_token_seq,
        'status', 'COMPLETED',
        'subtotal_paise', v_subtotal_paise,
        'discount_paise', v_discount_paise,
        'tax_paise', v_tax_paise,
        'cgst_paise', v_cgst_paise,
        'sgst_paise', v_sgst_paise,
        'total_paise', v_total_paise,
        'idempotent', false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT, UUID
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. RLS POLICIES, GRANTS & REALTIME PUBLICATION
-- -----------------------------------------------------------------------------

ALTER TABLE public.billing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_session_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_sessions FROM PUBLIC, anon;
REVOKE ALL ON public.billing_session_events FROM PUBLIC, anon;

-- Staff and Owner can select billing sessions
GRANT SELECT ON public.billing_sessions TO authenticated;
GRANT SELECT ON public.billing_session_events TO authenticated;

-- Direct inserts/updates to billing_sessions are prohibited from authenticated staff/anon
-- All starts/stops happen strictly via SECURITY DEFINER RPCs: start_billing_session, stop_billing_session
REVOKE INSERT, UPDATE, DELETE ON public.billing_sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_session_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.billing_sessions TO service_role;
GRANT ALL ON public.billing_session_events TO service_role;

-- SELECT policies
DROP POLICY IF EXISTS "billing_sessions_select_policy" ON public.billing_sessions;
CREATE POLICY "billing_sessions_select_policy" ON public.billing_sessions
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR (public.get_user_role() = 'staff' AND store_id = public.get_user_store_id())
    );

DROP POLICY IF EXISTS "billing_session_events_select_policy" ON public.billing_session_events;
CREATE POLICY "billing_session_events_select_policy" ON public.billing_session_events
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR (public.get_user_role() = 'staff' AND store_id = public.get_user_store_id())
    );

-- Function permissions
REVOKE EXECUTE ON FUNCTION public.start_billing_session(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stop_billing_session(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_billing_session(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_store_active_cashiers(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_terminal_billing_status(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_billing_session(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stop_billing_session(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_billing_session(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_store_active_cashiers(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_terminal_billing_status(UUID) TO authenticated, service_role;

-- Enable Supabase Realtime on billing_sessions and billing_session_events
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'billing_sessions'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_sessions;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'billing_session_events'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_session_events;
        END IF;
    END IF;
END $$;
