import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Mock cookies
const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

const mockGetUser = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockFrom = vi.fn();
const mockInviteUserByEmail = vi.fn();
const mockUpdateUserById = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
        updateUserById: mockUpdateUserById,
      },
    },
  })),
}));

import * as menuActions from '@/app/actions/menu';
import * as staffActions from '@/app/actions/staff';

describe('Final Security Hardening — Menu Server Actions & Browser Write Elimination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockOwnerAuth() {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'owner-id', email: 'owner@everytimecreamery.com' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'owner-id',
        store_id: '00000000-0000-0000-0000-000000000001',
        role: 'owner',
        full_name: 'Store Owner',
      },
      error: null,
    });
  }

  function mockStaffAuth() {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'staff-id', email: 'staff@everytimecreamery.com' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'staff-id',
        store_id: '00000000-0000-0000-0000-000000000001',
        role: 'staff',
        full_name: 'Counter Staff',
      },
      error: null,
    });
  }

  it('1. saveMenuItemAction saves/updates menu_variants and soft-archives removed variants', async () => {
    mockOwnerAuth();

    const menuItemUpsert = vi.fn().mockResolvedValue({ error: null });
    const variantSelectEq = vi.fn().mockResolvedValue({
      data: [
        { id: 'var-250' },
        { id: 'var-removed' },
      ],
      error: null,
    });
    const variantArchiveIn = vi.fn().mockResolvedValue({ error: null });
    const variantArchiveUpdate = vi.fn().mockReturnValue({ in: variantArchiveIn });
    const variantUpsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'menu_items') {
        return { upsert: menuItemUpsert };
      }
      if (table === 'menu_variants') {
        return {
          select: vi.fn().mockReturnValue({ eq: variantSelectEq }),
          update: variantArchiveUpdate,
          upsert: variantUpsert,
        };
      }
      return {};
    });

    const result = await menuActions.saveMenuItemAction({
      id: 'tub-classic-vanilla',
      name: 'Classic Vanilla Tub',
      category_id: 'tubs',
      base_price_paise: 16900,
      variants: [
        { id: 'var-250', label: '250ml', price_paise: 16900, volume_ml: 250 },
        { label: '500ml', price_paise: 32900, volume_ml: 500 },
      ],
    });

    expect(result.success).toBe(true);
    expect(menuItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tub-classic-vanilla',
        interaction_type: 'gelato_sizes',
        updated_by: 'owner-id',
      })
    );
    expect(variantArchiveUpdate).toHaveBeenCalledWith({ is_archived: true });
    expect(variantArchiveIn).toHaveBeenCalledWith('id', ['var-removed']);
    expect(variantUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'var-250',
          menu_item_id: 'tub-classic-vanilla',
          label: '250ml',
          price_paise: 16900,
          volume_ml: 250,
          is_archived: false,
        }),
        expect.objectContaining({
          menu_item_id: 'tub-classic-vanilla',
          label: '500ml',
          price_paise: 32900,
          volume_ml: 500,
          is_archived: false,
        }),
      ]),
      { onConflict: 'id' }
    );
  });

  it('2. saveMenuItemAction validates variants and derives interaction_type for hot_chocolate', async () => {
    mockOwnerAuth();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      };
    });

    const badVariant = await menuActions.saveMenuItemAction({
      name: 'Hot Chocolate',
      category_id: 'hot_chocolate',
      base_price_paise: 7900,
      variants: [{ label: '   ', price_paise: 7900 }],
    });
    expect(badVariant.success).toBe(false);
    expect(badVariant.error).toMatch(/variant label/i);

    mockOwnerAuth();
    const menuItemUpsert = vi.fn().mockResolvedValue({ error: null });
    const variantUpsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'menu_items') return { upsert: menuItemUpsert };
      if (table === 'menu_variants') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          upsert: variantUpsert,
        };
      }
      return {};
    });

    const okHotChoc = await menuActions.saveMenuItemAction({
      id: 'hot-choc-custom',
      name: 'Hot Chocolate',
      category_id: 'hot_chocolate',
      base_price_paise: 7900,
      variants: [
        { id: 'opt-1', label: 'Option 1', price_paise: 7900 },
        { id: 'opt-2', label: 'Option 2', price_paise: 14900 },
      ],
    });
    expect(okHotChoc.success).toBe(true);
    expect(menuItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        interaction_type: 'hot_chocolate_options',
      })
    );
  });

  it('3. toggleMenuItemAvailabilityAction, setMenuItemArchivedAction, and setCategoryArchivedAction exist and enforce owner RBAC', async () => {
    expect(typeof (menuActions as any).toggleMenuItemAvailabilityAction).toBe('function');
    expect(typeof (menuActions as any).setMenuItemArchivedAction).toBe('function');
    expect(typeof (menuActions as any).setCategoryArchivedAction).toBe('function');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      return {};
    });

    // Staff blocked on availability toggle
    mockStaffAuth();
    const toggleStaff = await (menuActions as any).toggleMenuItemAvailabilityAction('item-1', true);
    expect(toggleStaff.success).toBe(false);
    expect(toggleStaff.error).toMatch(/forbidden/i);

    // Staff blocked on archive item
    mockStaffAuth();
    const archiveItemStaff = await (menuActions as any).setMenuItemArchivedAction('item-1', true);
    expect(archiveItemStaff.success).toBe(false);
    expect(archiveItemStaff.error).toMatch(/forbidden/i);

    // Staff blocked on archive category
    mockStaffAuth();
    const archiveCatStaff = await (menuActions as any).setCategoryArchivedAction('sundaes', true);
    expect(archiveCatStaff.success).toBe(false);
    expect(archiveCatStaff.error).toMatch(/forbidden/i);
  });

  it('4. setCategoryArchivedAction protects frequent/extra and prevents archiving categories with active items', async () => {
    mockOwnerAuth();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'menu_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', name: 'Hot Choc' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const freqRes = await (menuActions as any).setCategoryArchivedAction('frequent', true);
    expect(freqRes.success).toBe(false);
    expect(freqRes.error).toMatch(/virtual category/i);

    mockOwnerAuth();
    const extraRes = await (menuActions as any).setCategoryArchivedAction('extra', true);
    expect(extraRes.success).toBe(false);
    expect(extraRes.error).toMatch(/protected system category/i);

    mockOwnerAuth();
    const activeItemsRes = await (menuActions as any).setCategoryArchivedAction('hot_chocolate', true);
    expect(activeItemsRes.success).toBe(false);
    expect(activeItemsRes.error).toMatch(/1 active menu item/i);
  });

  it('5. Owner menu UI and helpers contain NO direct browser writes, and StaffManagementView does not SELECT * on profiles', () => {
    const filesToCheckNoDirectWrites = [
      'lib/supabase/menu.ts',
      'lib/supabase/orders.ts',
      'components/owner/menu/OwnerMenuManagementView.tsx',
      'components/owner/menu/MenuItemFormDialog.tsx',
      'components/owner/menu/MenuCategoryDialog.tsx',
      'components/owner/menu/MenuArchiveDialog.tsx',
      'components/owner/StaffManagementView.tsx',
    ];

    for (const relPath of filesToCheckNoDirectWrites) {
      const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
      expect(content, `${relPath} must not perform direct browser .upsert/.insert/.update/.delete`).not.toMatch(
        /\.from\([^)]+\)\s*\.\s*(insert|update|upsert|delete)\s*\(/
      );
      expect(content, `${relPath} must not call .rpc() directly from browser`).not.toMatch(
        /\.rpc\s*\(/
      );
      expect(content, `${relPath} must never reference service role key`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY'
      );
    }

    const ownerSectionSrc = fs.readFileSync(
      path.join(process.cwd(), 'components/owner/OwnerSectionView.tsx'),
      'utf-8'
    );
    expect(ownerSectionSrc).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.\s*select\(\s*['"]\*['"]\s*\)/);
  });

  it('6. saveMenuItemAction enforces gelato 85g invariant and archives stale variants when switching to gelato', async () => {
    mockOwnerAuth();

    const menuItemUpsert = vi.fn().mockResolvedValue({ error: null });
    const variantArchiveIn = vi.fn().mockResolvedValue({ error: null });
    const variantArchiveUpdate = vi.fn().mockReturnValue({ in: variantArchiveIn });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'menu_items') return { upsert: menuItemUpsert };
      if (table === 'menu_variants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'old-var-1' }], error: null }),
          }),
          update: variantArchiveUpdate,
        };
      }
      return {};
    });

    const res = await menuActions.saveMenuItemAction({
      id: 'gelato-converted',
      name: 'Converted Gelato',
      category_id: 'gelato',
      base_price_paise: 9900,
      portion_grams: 250,
      variants: [{ id: 'old-var-1', label: '250ml', price_paise: 16900 }],
    });

    expect(res.success).toBe(true);
    expect(menuItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        portion_grams: 85,
        interaction_type: 'direct',
      })
    );
    expect(variantArchiveUpdate).toHaveBeenCalledWith({ is_archived: true });
    expect(variantArchiveIn).toHaveBeenCalledWith('id', ['old-var-1']);
  });

  it('7. Owner succeeds on availability toggle, archive, restore, and employee record server actions; staff is blocked on employee records', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: '22222222-2222-2222-2222-222222222222',
        full_name: 'New Cashier',
        email: 'newstaff@everytimecreamery.com',
        phone: null,
        store_id: '00000000-0000-0000-0000-000000000001',
        cashier_code: 'C05',
        is_active: true,
      },
      error: null,
    });
    const insertSelectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: insertSelectMock });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '00000000-0000-0000-0000-000000000001' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'menu_items' || table === 'categories') {
        return { update: updateMock };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: insertMock,
        };
      }
      return {};
    });

    // Owner toggles availability
    mockOwnerAuth();
    const toggleRes = await menuActions.toggleMenuItemAvailabilityAction('item-1', true);
    expect(toggleRes.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_available: false, updated_by: 'owner-id' })
    );

    // Owner archives item
    mockOwnerAuth();
    const archiveRes = await menuActions.setMenuItemArchivedAction('item-1', true);
    expect(archiveRes.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_archived: true, updated_by: 'owner-id' })
    );

    // Staff blocked from creating employee records
    mockStaffAuth();
    const staffCreateRes = await staffActions.createStaffMemberAction({
      fullName: 'Buddy',
      storeId: '00000000-0000-0000-0000-000000000001',
      cashierCode: 'C99',
    });
    expect(staffCreateRes.success).toBe(false);
    expect(staffCreateRes.error).toMatch(/forbidden/i);

    // Owner creates employee record without Supabase Auth admin provisioning
    mockOwnerAuth();
    const ownerCreateRes = await staffActions.createStaffMemberAction({
      fullName: 'New Cashier',
      email: 'NewStaff@EverytimeCreamery.com ',
      storeId: '00000000-0000-0000-0000-000000000001',
      cashierCode: 'c05',
    });
    expect(ownerCreateRes.success).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'New Cashier',
        email: 'newstaff@everytimecreamery.com',
        store_id: '00000000-0000-0000-0000-000000000001',
        cashier_code: 'C05',
        is_active: true,
      })
    );
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });
});
