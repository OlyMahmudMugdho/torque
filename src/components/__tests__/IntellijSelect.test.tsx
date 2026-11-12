import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IntellijSelect, type IntellijSelectOption } from '../IntellijSelect';

const sampleOptions: IntellijSelectOption[] = [
  { value: 'opt1', label: 'Option One', description: 'First option description' },
  { value: 'opt2', label: 'Option Two' },
  { value: 'opt3', label: 'Option Three' },
];

describe('IntellijSelect component', () => {
  it('renders with initial selected value and trigger button', () => {
    render(
      <IntellijSelect
        value="opt1"
        onChange={vi.fn()}
        options={sampleOptions}
        isDark={false}
        testId="sample-select"
        ariaLabel="Sample Select"
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Option One');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens themed dropdown on click and displays options', () => {
    render(
      <IntellijSelect
        value="opt1"
        onChange={vi.fn()}
        options={sampleOptions}
        isDark={true}
        testId="sample-select"
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveClass('bg-[#2b2d30]'); // Dark theme container

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('renders light theme styling when isDark is false', () => {
    render(
      <IntellijSelect
        value="opt2"
        onChange={vi.fn()}
        options={sampleOptions}
        isDark={false}
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveClass('bg-white'); // Light theme container
  });

  it('selects option on click and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <IntellijSelect
        value="opt1"
        onChange={onChange}
        options={sampleOptions}
        isDark={true}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /Option Two/i }));

    expect(onChange).toHaveBeenCalledWith('opt2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(
      <IntellijSelect
        value="opt1"
        onChange={vi.fn()}
        options={sampleOptions}
        isDark={true}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports hidden native select change for test and accessibility compatibility', () => {
    const onChange = vi.fn();
    render(
      <IntellijSelect
        value="opt1"
        onChange={onChange}
        options={sampleOptions}
        isDark={false}
        testId="compat-select"
      />
    );

    const hiddenSelect = screen.getByTestId('compat-select') as HTMLSelectElement;
    expect(hiddenSelect).toBeInTheDocument();
    expect(hiddenSelect.value).toBe('opt1');

    fireEvent.change(hiddenSelect, { target: { value: 'opt3' } });
    expect(onChange).toHaveBeenCalledWith('opt3');
  });
});
