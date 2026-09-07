import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export function DatePicker({ value, onChange, className = "form-input", required = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1); // 1-indexed
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync calendar picker focus month to typed/passed date
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        setTimeout(() => {
          setCurrentYear(y);
          setCurrentMonth(m);
        }, 0);
      }
    }
  }, [value]);

  // Position portal dropdown correctly relative to trigger input
  useEffect(() => {
    if (open && ref.current) {
      const updatePosition = () => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const spaceBelowWindow = window.innerHeight - rect.bottom;
        
        // Calendar height is ~280px. If less than 280px below input, open UPWARDS
        const willOpenUp = spaceBelowWindow < 280;
        
        setCoords({
          top: willOpenUp 
            ? rect.top + window.scrollY - 286 // 280px height + 6px gap
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width
        });
      };
      
      updatePosition();
      // Scroll listener with useCapture=true captures modal scroll as well
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [open]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    function close(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);
  }

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sunday

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  // Padding for first week days
  for (let i = 0; i < firstDayIndex; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Padding for last week days
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  function selectDate(day: number) {
    const y = currentYear;
    const m = currentMonth.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  }

  function changeMonth(direction: 'prev' | 'next') {
    if (direction === 'prev') {
      if (currentMonth === 1) {
        setCurrentMonth(12);
        setCurrentYear(y => y - 1);
      } else {
        setCurrentMonth(m => m - 1);
      }
    } else {
      if (currentMonth === 12) {
        setCurrentMonth(1);
        setCurrentYear(y => y + 1);
      } else {
        setCurrentMonth(m => m + 1);
      }
    }
  }

  // Check if a day is the currently selected date
  function isSelected(day: number) {
    if (!value) return false;
    const targetStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return value === targetStr;
  }

  // Check if today
  function isToday(day: number) {
    const today = new Date();
    return (
      today.getFullYear() === currentYear &&
      today.getMonth() + 1 === currentMonth &&
      today.getDate() === day
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          className={className}
          value={value}
          onChange={handleInputChange}
          placeholder="YYYY-MM-DD"
          required={required}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          style={{ paddingRight: 32 }}
        />
        <Calendar
          size={14}
          style={{
            position: 'absolute',
            right: 10,
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="sidebar-dropdown animate-fade-in"
          style={{
            position: 'absolute',
            left: coords.left,
            top: coords.top,
            width: 250,
            zIndex: 9999,
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
            userSelect: 'none',
          }}
        >
          {/* Header with Quick Navigation Dropdowns */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Month Selector */}
              <select
                value={currentMonth}
                onChange={e => setCurrentMonth(parseInt(e.target.value, 10))}
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 12,
                  fontWeight: 650,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>

              {/* Year Selector */}
              <select
                value={currentYear}
                onChange={e => setCurrentYear(parseInt(e.target.value, 10))}
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 12,
                  fontWeight: 650,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              >
                {Array.from({ length: 121 }, (_, i) => 1950 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {/* Today Quick Jump Button */}
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setCurrentYear(today.getFullYear());
                  setCurrentMonth(today.getMonth() + 1);
                  const y = today.getFullYear();
                  const m = (today.getMonth() + 1).toString().padStart(2, '0');
                  const d = today.getDate().toString().padStart(2, '0');
                  onChange(`${y}-${m}-${d}`);
                  setOpen(false);
                }}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  height: 20,
                  minHeight: 20,
                  background: 'var(--green-glow)',
                  color: 'var(--green)',
                  border: 'none',
                  borderRadius: 4,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Today
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => changeMonth('prev')}
                style={{ width: 20, height: 20, minHeight: 20, padding: 0 }}
              >
                <ChevronLeft size={12} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => changeMonth('next')}
                style={{ width: 20, height: 20, minHeight: 20, padding: 0 }}
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>

          {/* Days labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 6 }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Weeks and days grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {weeks.map((week, wIdx) => (
              <div key={wIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {week.map((day, dIdx) => {
                  if (day === null) {
                    return <span key={dIdx} />;
                  }
                  
                  const active = isSelected(day);
                  const today = isToday(day);
                  
                  return (
                    <button
                      key={dIdx}
                      type="button"
                      onClick={() => selectDate(day)}
                      style={{
                        height: 24,
                        width: '100%',
                        border: 'none',
                        borderRadius: 6,
                        background: active ? 'var(--green)' : today ? 'var(--green-glow)' : 'transparent',
                        color: active ? '#fff' : today ? 'var(--green)' : 'var(--text-secondary)',
                        fontSize: 11,
                        fontWeight: active || today ? '600' : '400',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.background = 'var(--surface-3)';
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.background = today ? 'var(--green-glow)' : 'transparent';
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
