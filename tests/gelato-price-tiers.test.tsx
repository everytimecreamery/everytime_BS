import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StaffPOS } from '@/components/staff/StaffPOS';
import { derivePriceTiers, PriceTierChips } from '@/components/staff/pos/PriceTierChips';
import { CACHED_MENU_CATALOG_KEY } from '@/lib/pos/menuCatalog';
import { MenuItem, MenuCategory } from '@/lib/mock/menu';

const mockGelatoCategories: MenuCategory[] = [
  { id: 'frequent', label: 'Frequent', iconName: 'Flame', description: '' },
  { id: 'gelato', label: 'Gelato', iconName: 'IceCream', description: '' },
  { id: 'sundaes', label: 'Sundaes', iconName: 'Cherry', description: '' },
];

const mockGelatoItems: MenuItem[] = [
  {
    id: 'gelato-french-vanilla',
    name: 'French Vanilla',
    categoryId: 'gelato',
    basePricePaise: 8500, // White tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-tender-coconut',
    name: 'Tender Coconut',
    categoryId: 'gelato',
    basePricePaise: 8500, // White tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-avacado',
    name: 'Avacado',
    categoryId: 'gelato',
    basePricePaise: 9900, // Red tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-chocolate-bliss',
    name: 'Chocolate Bliss',
    categoryId: 'gelato',
    basePricePaise: 9900, // Red tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-hazel-nutella',
    name: 'Hazel Nutella',
    categoryId: 'gelato',
    basePricePaise: 12500, // Black tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-tiramisu',
    name: 'Tiramisu',
    categoryId: 'gelato',
    basePricePaise: 12500, // Black tier
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'gelato-pistachio-special',
    name: 'Pistachio Special',
    categoryId: 'gelato',
    basePricePaise: 10900, // Custom unmapped price
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
    portionGrams: 85,
  },
  {
    id: 'sundae-hot-chocolate-fudge',
    name: 'Hot Chocolate Fudge',
    categoryId: 'sundaes',
    basePricePaise: 14900,
    interactionType: 'direct',
    isAvailable: true,
    isArchived: false,
  },
];

describe('Gelato Price-Tier Sub-Category Chips Feature', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      CACHED_MENU_CATALOG_KEY,
      JSON.stringify({
        categories: mockGelatoCategories,
        items: mockGelatoItems,
        updatedAt: Date.now(),
      })
    );
  });

  describe('derivePriceTiers Unit Tests', () => {
    it('derives "All", "White ₹85", "Red ₹99", "₹109", and "Black ₹125" sorted ascending', () => {
      const gelatoOnly = mockGelatoItems.filter((i) => i.categoryId === 'gelato');
      const tiers = derivePriceTiers(gelatoOnly);

      expect(tiers).toHaveLength(5);
      expect(tiers[0]).toEqual({
        id: 'all',
        primaryLabel: 'All',
        count: 7,
      });
      expect(tiers[1]).toEqual({
        id: 8500,
        primaryLabel: 'White',
        secondaryLabel: '₹85',
        pricePaise: 8500,
        count: 2,
      });
      expect(tiers[2]).toEqual({
        id: 9900,
        primaryLabel: 'Red',
        secondaryLabel: '₹99',
        pricePaise: 9900,
        count: 2,
      });
      expect(tiers[3]).toEqual({
        id: 10900,
        primaryLabel: '₹109',
        pricePaise: 10900,
        count: 1,
      });
      expect(tiers[4]).toEqual({
        id: 12500,
        primaryLabel: 'Black',
        secondaryLabel: '₹125',
        pricePaise: 12500,
        count: 2,
      });
    });
  });

  describe('Staff POS Integration with Gelato Price-Tier Chips', () => {
    it('1. All shows every gelato item by default when entering Gelato category', () => {
      render(<StaffPOS />);

      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      // Chips row is rendered
      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      expect(chipsGroup).toBeInTheDocument();

      // "All" chip is active by default
      const allChip = within(chipsGroup).getByRole('button', { name: /All/i });
      expect(allChip).toHaveAttribute('aria-pressed', 'true');

      // Every gelato item is present in the grid
      expect(screen.getByText('French Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Tender Coconut')).toBeInTheDocument();
      expect(screen.getByText('Avacado')).toBeInTheDocument();
      expect(screen.getByText('Chocolate Bliss')).toBeInTheDocument();
      expect(screen.getByText('Hazel Nutella')).toBeInTheDocument();
      expect(screen.getByText('Tiramisu')).toBeInTheDocument();
      expect(screen.getByText('Pistachio Special')).toBeInTheDocument();
    });

    it('2. Gelato + White shows only 8500-paise items', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      const whiteChip = within(chipsGroup).getByRole('button', { name: /White/i });
      fireEvent.click(whiteChip);

      expect(whiteChip).toHaveAttribute('aria-pressed', 'true');

      // 8500-paise items are visible
      expect(screen.getByText('French Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Tender Coconut')).toBeInTheDocument();

      // Other tiers are excluded
      expect(screen.queryByText('Avacado')).not.toBeInTheDocument();
      expect(screen.queryByText('Chocolate Bliss')).not.toBeInTheDocument();
      expect(screen.queryByText('Hazel Nutella')).not.toBeInTheDocument();
      expect(screen.queryByText('Tiramisu')).not.toBeInTheDocument();
      expect(screen.queryByText('Pistachio Special')).not.toBeInTheDocument();
    });

    it('3. Gelato + Red shows only 9900-paise items', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      const redChip = within(chipsGroup).getByRole('button', { name: /Red/i });
      fireEvent.click(redChip);

      expect(redChip).toHaveAttribute('aria-pressed', 'true');

      // 9900-paise items are visible
      expect(screen.getByText('Avacado')).toBeInTheDocument();
      expect(screen.getByText('Chocolate Bliss')).toBeInTheDocument();

      // Other tiers are excluded
      expect(screen.queryByText('French Vanilla')).not.toBeInTheDocument();
      expect(screen.queryByText('Tender Coconut')).not.toBeInTheDocument();
      expect(screen.queryByText('Hazel Nutella')).not.toBeInTheDocument();
      expect(screen.queryByText('Tiramisu')).not.toBeInTheDocument();
      expect(screen.queryByText('Pistachio Special')).not.toBeInTheDocument();
    });

    it('4. Gelato + Black shows only 12500-paise items', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      const blackChip = within(chipsGroup).getByRole('button', { name: /Black/i });
      fireEvent.click(blackChip);

      expect(blackChip).toHaveAttribute('aria-pressed', 'true');

      // 12500-paise items are visible
      expect(screen.getByText('Hazel Nutella')).toBeInTheDocument();
      expect(screen.getByText('Tiramisu')).toBeInTheDocument();

      // Other tiers are excluded
      expect(screen.queryByText('French Vanilla')).not.toBeInTheDocument();
      expect(screen.queryByText('Tender Coconut')).not.toBeInTheDocument();
      expect(screen.queryByText('Avacado')).not.toBeInTheDocument();
      expect(screen.queryByText('Chocolate Bliss')).not.toBeInTheDocument();
      expect(screen.queryByText('Pistachio Special')).not.toBeInTheDocument();
    });

    it('5. Seeded 10900-paise item appears under All and produces a "₹109" chip', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      const customChip = within(chipsGroup).getByRole('button', { name: /₹109/i });
      expect(customChip).toBeInTheDocument();

      // Clicking custom chip shows only the 10900 item
      fireEvent.click(customChip);
      expect(screen.getByText('Pistachio Special')).toBeInTheDocument();
      expect(screen.queryByText('French Vanilla')).not.toBeInTheDocument();
      expect(screen.queryByText('Avacado')).not.toBeInTheDocument();
      expect(screen.queryByText('Hazel Nutella')).not.toBeInTheDocument();
    });

    it('6. Search inside White ANDs correctly (activeCategory ∩ activeChip ∩ search)', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      // Select White tier (French Vanilla & Tender Coconut)
      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      fireEvent.click(within(chipsGroup).getByRole('button', { name: /White/i }));

      // Search "vanilla"
      const searchInput = screen.getByRole('textbox', { name: /Search menu products/i });
      fireEvent.change(searchInput, { target: { value: 'vanilla' } });

      // Only French Vanilla matches (White ∩ "vanilla")
      expect(screen.getByText('French Vanilla')).toBeInTheDocument();
      expect(screen.queryByText('Tender Coconut')).not.toBeInTheDocument();
      expect(screen.queryByText('Avacado')).not.toBeInTheDocument();

      // Search "avacado" (which is Red tier, not White)
      fireEvent.change(searchInput, { target: { value: 'avacado' } });
      expect(screen.queryByText('French Vanilla')).not.toBeInTheDocument();
      expect(screen.queryByText('Avacado')).not.toBeInTheDocument();
      expect(screen.getByText('No Menu Products Found')).toBeInTheDocument();
    });

    it('7. Switching to Sundaes hides chips and resets selection to All on return', () => {
      render(<StaffPOS />);
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      const chipsGroup = screen.getByRole('group', { name: /Gelato price tier filter/i });
      const whiteChip = within(chipsGroup).getByRole('button', { name: /White/i });
      fireEvent.click(whiteChip);
      expect(whiteChip).toHaveAttribute('aria-pressed', 'true');

      // Switch to Sundaes
      fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));

      // Chip row is hidden
      expect(
        screen.queryByRole('group', { name: /Gelato price tier filter/i })
      ).not.toBeInTheDocument();
      expect(screen.getByText('Hot Chocolate Fudge')).toBeInTheDocument();

      // Return to Gelato
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      // Chip row reappears and selection is reset to "All"
      const returnedChipsGroup = screen.getByRole('group', {
        name: /Gelato price tier filter/i,
      });
      expect(returnedChipsGroup).toBeInTheDocument();
      const allChip = within(returnedChipsGroup).getByRole('button', { name: /All/i });
      expect(allChip).toHaveAttribute('aria-pressed', 'true');

      // All items are visible again
      expect(screen.getByText('French Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Avacado')).toBeInTheDocument();
      expect(screen.getByText('Hazel Nutella')).toBeInTheDocument();
    });
  });
});
