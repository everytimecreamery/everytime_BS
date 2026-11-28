'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireOwner } from '@/lib/auth/rbac';

export interface StaffMemberRecord {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  store_id: string;
  cashier_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffStoreOption {
  id: string;
  name: string;
}

export interface StaffActionResult<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface SaveStaffMemberInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  storeId: string;
  cashierCode: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CASHIER_CODE_REGEX = /^[A-Za-z0-9_-]{1,20}$/;
const PHONE_ALLOWED_REGEX = /^[0-9+\-()\s]{7,30}$/;

const STAFF_MEMBER_COLUMNS =
  'id, full_name, email, phone, store_id, cashier_code, is_active, created_at, updated_at';

function validateAndNormalizeStaffInput(input: SaveStaffMemberInput):
  | {
    ok: true;
    value: {
      full_name: string;
      email: string | null;
      phone: string | null;
      store_id: string;
      cashier_code: string;
    };
  }
  | { ok: false; error: string } {
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (!fullName) {
    return { ok: false, error: 'Employee full name is required.' };
  }
  if (fullName.length > 120) {
    return { ok: false, error: 'Employee full name must be 120 characters or fewer.' };
  }

  const rawEmail = typeof input.email === 'string' ? input.email.trim() : '';
  let normalizedEmail: string | null = null;
  if (rawEmail) {
    if (rawEmail.length > 254 || !EMAIL_REGEX.test(rawEmail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    normalizedEmail = rawEmail.toLowerCase();
  }

  const rawPhone = typeof input.phone === 'string' ? input.phone.trim() : '';
  let normalizedPhone: string | null = null;
  if (rawPhone) {
    const digitCount = rawPhone.replace(/\D/g, '').length;
    if (!PHONE_ALLOWED_REGEX.test(rawPhone) || digitCount < 7 || digitCount > 15) {
      return {
        ok: false,
        error: 'Contact number must contain 7 to 15 digits (spaces, +, -, parentheses allowed).',
      };
    }
    normalizedPhone = rawPhone;
  }

  const storeId = typeof input.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return { ok: false, error: 'Assigned store is required.' };
  }
  if (!UUID_REGEX.test(storeId)) {
    return { ok: false, error: 'Assigned store selection is invalid.' };
  }

  const rawCode = typeof input.cashierCode === 'string' ? input.cashierCode.trim() : '';
  if (!rawCode) {
    return { ok: false, error: 'Cashier code is required.' };
  }
  if (!CASHIER_CODE_REGEX.test(rawCode)) {
    return {
      ok: false,
      error:
        'Cashier code must be 1–20 characters using only letters, numbers, hyphens, or underscores.',
    };
  }
  const normalizedCode = rawCode.toUpperCase();

  return {
    ok: true,
    value: {
      full_name: fullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      store_id: storeId,
      cashier_code: normalizedCode,
    },
  };
}

async function verifyStoreExists(supabase: any, storeId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .maybeSingle();

  if (error) {
    return error.message;
  }
  if (!data) {
    return 'Assigned store does not exist.';
  }
  return null;
}

async function checkDuplicateCashierCode(
  supabase: any,
  cashierCode: string,
  excludeEmployeeId?: string
): Promise<string | null> {
  let query = supabase
    .from('staff_members')
    .select('id, cashier_code')
    .eq('cashier_code', cashierCode);

  if (excludeEmployeeId && typeof query.neq === 'function') {
    query = query.neq('id', excludeEmployeeId);
  }

  const { data, error } = await query;
  if (error) {
    return error.message;
  }
  const conflict = (data || []).find(
    (row: { id: string; cashier_code: string }) =>
      row.id !== excludeEmployeeId &&
      row.cashier_code?.trim().toUpperCase() === cashierCode
  );
  if (conflict) {
    return `Cashier code "${cashierCode}" is already assigned to another employee.`;
  }
  return null;
}

function mapStaffDbError(error: any, fallback: string): string {
  if (
    error?.code === '23505' ||
    /unique constraint|duplicate key|idx_staff_members_unique_cashier_code/i.test(
      error?.message || ''
    )
  ) {
    return 'This cashier code is already assigned to another employee.';
  }
  if (error?.code === '23503' || /foreign key constraint/i.test(error?.message || '')) {
    return 'Assigned store does not exist.';
  }
  return error?.message || fallback;
}

/**
 * Owner-only Server Action to load stores and employee records.
 */
export async function listStaffManagementDataAction(): Promise<
  StaffActionResult<{
    stores: StaffStoreOption[];
    staffMembers: StaffMemberRecord[];
  }>
> {
  try {
    await requireOwner();
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore) as any;

    const [storesRes, staffRes] = await Promise.all([
      supabase
        .from('stores')
        .select('id, name')
        .order('created_at', { ascending: true }),
      supabase
        .from('staff_members')
        .select(STAFF_MEMBER_COLUMNS)
        .order('is_active', { ascending: false })
        .order('full_name', { ascending: true }),
    ]);

    if (storesRes.error) {
      return { success: false, error: storesRes.error.message };
    }
    if (staffRes.error) {
      return { success: false, error: staffRes.error.message };
    }

    return {
      success: true,
      data: {
        stores: storesRes.data || [],
        staffMembers: staffRes.data || [],
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to load employee records.',
    };
  }
}

/**
 * Owner-only Server Action to create a new employee record.
 */
export async function createStaffMemberAction(
  input: SaveStaffMemberInput
): Promise<StaffActionResult<StaffMemberRecord>> {
  try {
    await requireOwner();

    const parsed = validateAndNormalizeStaffInput(input);
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore) as any;

    const storeError = await verifyStoreExists(supabase, parsed.value.store_id);
    if (storeError) {
      return { success: false, error: storeError };
    }

    const dupError = await checkDuplicateCashierCode(supabase, parsed.value.cashier_code);
    if (dupError) {
      return { success: false, error: dupError };
    }

    const { data, error } = await supabase
      .from('staff_members')
      .insert({
        ...parsed.value,
        is_active: true,
      })
      .select(STAFF_MEMBER_COLUMNS)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: mapStaffDbError(error, 'Failed to add employee record.'),
      };
    }

    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to add employee record.',
    };
  }
}

/**
 * Owner-only Server Action to update an existing employee record.
 */
export async function updateStaffMemberAction(
  employeeId: string,
  input: SaveStaffMemberInput
): Promise<StaffActionResult<StaffMemberRecord>> {
  try {
    await requireOwner();

    const targetId = typeof employeeId === 'string' ? employeeId.trim() : '';
    if (!targetId || !UUID_REGEX.test(targetId)) {
      return { success: false, error: 'A valid employee ID is required.' };
    }

    const parsed = validateAndNormalizeStaffInput(input);
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore) as any;

    const { data: existing, error: lookupError } = await supabase
      .from('staff_members')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();

    if (lookupError) {
      return { success: false, error: lookupError.message };
    }
    if (!existing) {
      return { success: false, error: 'Employee record not found.' };
    }

    const storeError = await verifyStoreExists(supabase, parsed.value.store_id);
    if (storeError) {
      return { success: false, error: storeError };
    }

    const dupError = await checkDuplicateCashierCode(
      supabase,
      parsed.value.cashier_code,
      targetId
    );
    if (dupError) {
      return { success: false, error: dupError };
    }

    const { data, error } = await supabase
      .from('staff_members')
      .update({
        ...parsed.value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .select(STAFF_MEMBER_COLUMNS)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: mapStaffDbError(error, 'Failed to update employee record.'),
      };
    }

    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update employee record.',
    };
  }
}

/**
 * Owner-only Server Action to activate or deactivate an employee record.
 */
export async function setStaffMemberActiveAction(
  employeeId: string,
  isActive: boolean
): Promise<StaffActionResult<StaffMemberRecord>> {
  try {
    await requireOwner();

    const targetId = typeof employeeId === 'string' ? employeeId.trim() : '';
    if (!targetId || !UUID_REGEX.test(targetId)) {
      return { success: false, error: 'A valid employee ID is required.' };
    }
    if (typeof isActive !== 'boolean') {
      return { success: false, error: 'Active status must be a boolean.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore) as any;

    const { data: existing, error: lookupError } = await supabase
      .from('staff_members')
      .select(STAFF_MEMBER_COLUMNS)
      .eq('id', targetId)
      .maybeSingle();

    if (lookupError) {
      return { success: false, error: lookupError.message };
    }
    if (!existing) {
      return { success: false, error: 'Employee record not found.' };
    }

    const { data, error } = await supabase
      .from('staff_members')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .select(STAFF_MEMBER_COLUMNS)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: error?.message || 'Failed to update employee status.',
      };
    }

    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update employee status.',
    };
  }
}
