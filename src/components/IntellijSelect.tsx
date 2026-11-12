import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface IntellijSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export interface IntellijSelectProps<T extends string = string> {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: IntellijSelectOption<T>[];
  isDark: boolean;
  testId?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function IntellijSelect<T extends string = string>({
  id,
  value,
  onChange,
  options,
  isDark,
  testId,
  ariaLabel,
  className = '',
  disabled = false,
}: IntellijSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden native select for accessibility, screen readers, and automated testing */}
      <select
        id={id}
        data-testid={testId}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        tabIndex={-1}
        className="sr-only appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* JetBrains-styled Custom Select Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded border transition cursor-pointer text-left outline-none ${
          isDark
            ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5] hover:border-[#4e5157] focus:border-[#3574f0]'
            : 'bg-white border-[#d1d5db] text-[#1f2328] hover:border-[#9ca3af] focus:border-[#3574f0]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
          isOpen ? 'border-[#3574f0] ring-1 ring-[#3574f0]' : ''
        }`}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-150 opacity-60 ml-2 ${
            isOpen ? 'rotate-180 text-[#3574f0]' : ''
          }`}
        />
      </button>

      {/* Themed Dropdown Options Menu */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 right-0 top-full mt-1 py-1 rounded-md border shadow-2xl z-50 max-h-60 overflow-y-auto ${
            isDark
              ? 'bg-[#2b2d30] border-[#43454a] text-[#dfe1e5]'
              : 'bg-white border-[#d1d5db] text-[#1f2328]'
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                className={`group px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition select-none ${
                  isSelected
                    ? isDark
                      ? 'bg-[#3574f0]/20 text-[#3574f0] font-semibold hover:bg-[#3574f0] hover:text-white'
                      : 'bg-[#3574f0]/15 text-[#3574f0] font-semibold hover:bg-[#3574f0] hover:text-white'
                    : isDark
                      ? 'text-[#dfe1e5] hover:bg-[#3574f0] hover:text-white'
                      : 'text-[#1f2328] hover:bg-[#3574f0] hover:text-white'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="text-[10px] opacity-60 group-hover:text-white/80">
                      {opt.description}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 shrink-0 group-hover:text-white" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
