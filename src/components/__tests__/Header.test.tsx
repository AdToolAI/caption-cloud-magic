import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils/test-utils';
import { screen } from '@testing-library/dom';
import { Header } from '@/components/Header';

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

describe('Header', () => {
  it('renders the brand name', () => {
    render(<Header />);
    expect(screen.getByText('AdTool AI')).toBeInTheDocument();
  });

  it('shows login button when user is not authenticated', () => {
    render(<Header />);
    expect(screen.getByText('header.login')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getByText('nav.pricing')).toBeInTheDocument();
    expect(screen.getByText('nav.faq')).toBeInTheDocument();
  });

  it('has accessibility skip link', () => {
    render(<Header />);
    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveClass('sr-only');
  });
});
