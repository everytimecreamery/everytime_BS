import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';

describe('Shared UI Components', () => {
  describe('BrandLogo', () => {
    it('renders the brand title and monogram', () => {
      render(<BrandLogo />);
      expect(screen.getByText('Everytime Creamery')).toBeInTheDocument();
      expect(screen.getByText('EC')).toBeInTheDocument();
    });

    it('renders optional tagline by default', () => {
      render(<BrandLogo showTagline={true} />);
      expect(screen.getByText('Artisan Gelato & POS')).toBeInTheDocument();
    });

    it('renders as a link when href is provided', () => {
      render(<BrandLogo href="/" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/');
    });
  });

  describe('StatusBadge', () => {
    it('renders the status label', () => {
      render(<StatusBadge label="Phase 0 Active" variant="brand" />);
      expect(screen.getByText('Phase 0 Active')).toBeInTheDocument();
    });

    it('applies variant classes correctly', () => {
      const { container } = render(<StatusBadge label="Neutral Test" variant="neutral" />);
      expect(container.firstChild).toHaveClass('bg-white');
    });
  });
});

