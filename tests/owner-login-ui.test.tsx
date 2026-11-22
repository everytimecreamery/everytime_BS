import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OwnerLoginForm } from '@/app/owner/login/OwnerLoginForm';

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
let mockSearchParamsGet = vi.fn((key: string) => null as string | null);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

describe('OwnerLoginForm UI Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet = vi.fn((key: string) => null);
  });

  it('1. Renders the Owner Portal Login form with branding and fields', () => {
    render(<OwnerLoginForm />);

    expect(screen.getByText('Owner Portal Login')).toBeInTheDocument();
    expect(screen.getByText('Back Office')).toBeInTheDocument();
    expect(screen.getByLabelText(/Owner Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In as Owner/i })).toBeInTheDocument();
    expect(screen.getByText(/Staff Member\? Go to Counter POS/i)).toBeInTheDocument();
  });

  it('2. Password visibility toggle works correctly', () => {
    render(<OwnerLoginForm />);

    const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByLabelText(/Show password/i);
    expect(toggleButton).toBeInTheDocument();

    // Toggle on -> text
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByLabelText(/Hide password/i)).toBeInTheDocument();

    // Toggle off -> password
    fireEvent.click(screen.getByLabelText(/Hide password/i));
    expect(passwordInput.type).toBe('password');
  });

  it('3. Displays unauthorized alert when URL error query parameter is set', () => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'error' ? 'unauthorized' : null));

    render(<OwnerLoginForm />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Access restricted: Owner credentials required/i);
  });

  it('4. Displays session expired alert when URL error is session_expired', () => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'error' ? 'session_expired' : null));

    render(<OwnerLoginForm />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/session has expired/i);
  });

  it('5. Performs client-side validation on empty inputs', () => {
    render(<OwnerLoginForm />);

    const form = screen.getByRole('form', { name: /Owner Login Form/i });
    fireEvent.submit(form);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Please enter both/i);
  });

  it('6. Performs client-side email format validation', () => {
    render(<OwnerLoginForm />);

    const emailInput = screen.getByLabelText(/Owner Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password/i);

    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.change(passwordInput, { target: { value: 'MySecretPassword123' } });

    const form = screen.getByRole('form', { name: /Owner Login Form/i });
    fireEvent.submit(form);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/valid email address/i);
  });

  it('7. Contains link redirecting to staff counter portal', () => {
    render(<OwnerLoginForm />);

    const staffLink = screen.getByRole('link', { name: /Staff Member\? Go to Counter POS/i });
    expect(staffLink).toHaveAttribute('href', '/staff');
  });
});
