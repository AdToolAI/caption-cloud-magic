import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UniversalVideoCreator } from '../UniversalVideoCreator';

// Mock the step components
vi.mock('../steps/TemplateSelectionStep', () => ({
  TemplateSelectionStep: ({ onTemplateSelect }: any) => (
    <div data-testid="template-selection-step">
      <button onClick={() => onTemplateSelect({ id: '1', name: 'Test Template' })}>
        Select Template
      </button>
    </div>
  ),
}));

vi.mock('../steps/CustomizationStep', () => ({
  CustomizationStep: ({ onCustomizationsChange }: any) => (
    <div data-testid="customization-step">
      <button onClick={() => onCustomizationsChange({ field1: 'value1' })}>
        Add Customization
      </button>
    </div>
  ),
}));

vi.mock('../steps/ExportStep', () => ({
  ExportStep: () => (
    <div data-testid="export-step">Export Step</div>
  ),
}));

describe('UniversalVideoCreator', () => {
  it('should render with initial template selection step', () => {
    render(<UniversalVideoCreator contentType="ad" />);
    
    expect(screen.getByTestId('template-selection-step')).toBeInTheDocument();
    expect(screen.getByText('Template wählen')).toBeInTheDocument();
  });

  it('should show progress stepper with three steps', () => {
    render(<UniversalVideoCreator contentType="story" />);
    
    expect(screen.getByText('Template wählen')).toBeInTheDocument();
    expect(screen.getByText('Anpassen')).toBeInTheDocument();
    expect(screen.getByText('Exportieren & Rendern')).toBeInTheDocument();
  });

  it('should disable next button when no template is selected', () => {
    render(<UniversalVideoCreator contentType="reel" />);
    
    const nextButton = screen.getByRole('button', { name: /weiter/i });
    expect(nextButton).toBeDisabled();
  });

  it('should enable next button after template selection', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    const selectButton = screen.getByText('Select Template');
    await user.click(selectButton);
    
    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: /weiter/i });
      expect(nextButton).not.toBeDisabled();
    });
  });

  it('should navigate to customization step after clicking next', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    // Select template
    const selectButton = screen.getByText('Select Template');
    await user.click(selectButton);
    
    // Click next
    const nextButton = screen.getByRole('button', { name: /weiter/i });
    await user.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('customization-step')).toBeInTheDocument();
    });
  });

  it('should update active step indicator', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    // Initial state - first step active
    const stepIndicators = screen.getAllByRole('generic').filter(el => 
      el.className.includes('rounded-full')
    );
    
    // Select template and navigate
    await user.click(screen.getByText('Select Template'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('customization-step')).toBeInTheDocument();
    });
  });

  it('should show back button on second step', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    // Navigate to second step
    await user.click(screen.getByText('Select Template'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    
    await waitFor(() => {
      const backButton = screen.getByRole('button', { name: /zurück/i });
      expect(backButton).not.toBeDisabled();
    });
  });

  it('should navigate back to template selection', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    // Navigate to second step
    await user.click(screen.getByText('Select Template'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    
    // Go back
    await waitFor(async () => {
      const backButton = screen.getByRole('button', { name: /zurück/i });
      await user.click(backButton);
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('template-selection-step')).toBeInTheDocument();
    });
  });

  it('should hide navigation buttons on export step', async () => {
    const user = userEvent.setup();
    render(<UniversalVideoCreator contentType="ad" />);
    
    // Navigate through steps
    await user.click(screen.getByText('Select Template'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    
    await user.click(screen.getByText('Add Customization'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('export-step')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /weiter/i })).not.toBeInTheDocument();
    });
  });
});
