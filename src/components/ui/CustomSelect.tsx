import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  required?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  style
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, isUp: false });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current && 
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      
      // We limit dropdown max-height to 200px. If less than 210px below, flip UPWARDS
      const willOpenUp = spaceBelow < 210;
      
      setCoords({
        top: willOpenUp 
          ? rect.top + window.scrollY - 206 // 200px max height + 6px gap
          : rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
        isUp: willOpenUp
      });
    }
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div 
      ref={containerRef} 
      style={{ position: 'relative', width: '100%', ...style }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="form-select"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          width: '100%',
          height: 38,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '7px 10px',
          color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontSize: 13,
          cursor: 'pointer',
          backgroundImage: 'none', // Remove the native caret background image
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', marginLeft: 8 }} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            padding: 4,
          }}
          className="animate-fade-in"
        >
          {options.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-tertiary)' }}>No options available</div>
          ) : (
            options.map(opt => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: isActive ? 'var(--green-glow)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    color: isActive ? 'var(--green)' : 'var(--text-primary)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--surface-3)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
