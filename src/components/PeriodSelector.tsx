import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { getFiscalYear } from '../utils/fiscalYear';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type PeriodPreset = 'month' | '3m' | 'cfy' | 'lfy' | 'custom';

export function getCustomMonths(startStr: string, endStr: string): { y: number; m: number }[] {
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const result: { y: number; m: number }[] = [];

    let currY = start.getFullYear();
    let currM = start.getMonth() + 1;
    const endY = end.getFullYear();
    const endM = end.getMonth() + 1;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    while (currY < endY || (currY === endY && currM <= endM)) {
      result.push({ y: currY, m: currM });
      currM++;
      if (currM > 12) { currM = 1; currY++; }
    }
    return result;
  } catch (e) {
    return [];
  }
}

export function getPeriodMonths(preset: PeriodPreset, year: number, month: number, customStart?: string, customEnd?: string): { y: number; m: number }[] {
  const result: { y: number; m: number }[] = [];
  const addMonth = (y: number, m: number) => result.push({ y, m });

  if (preset === 'custom' && customStart && customEnd) {
    return getCustomMonths(customStart, customEnd);
  }

  if (preset === 'month') {
    addMonth(year, month);
  } else if (preset === '3m') {
    const count = 3;
    let y = year, m = month;
    for (let i = 0; i < count; i++) {
      addMonth(y, m);
      m--;
      if (m <= 0) { m = 12; y--; }
    }
  } else if (preset === 'cfy' || preset === 'lfy') {
    const { fyStartY } = fyFromAnchor(year, month);
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    let y = fyStartY;
    let m = 4; // April
    for (let i = 0; i < 12; i++) {
      if (y < curY || (y === curY && m <= curM)) {
        addMonth(y, m);
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  return result.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.m - b.m));
}

// ── Fiscal year helpers ──────────────────────────────────────────────────────
// FY in India: April–March. Anchor month = April (month 4).
const FY_START_MONTH = 4; // April

/** Returns { fyStart: {y, m} } for the FY that contains the given year/month anchor */
function fyFromAnchor(anchorYear: number, anchorMonth: number): { fyStartY: number } {
  // If anchor month is before FY_START_MONTH (Apr), FY started previous calendar year
  const fyStartY = anchorMonth >= FY_START_MONTH ? anchorYear : anchorYear - 1;
  return { fyStartY };
}

/** Returns the FY end year given start year */
function fyEndY(startY: number) { return startY + 1; }

/** Formats FY as "FY 2025–26" */
function fyLabel(startY: number) {
  return `FY ${startY}–${String(fyEndY(startY)).slice(-2)}`;
}

interface PeriodSelectorProps {
  year: number;
  month: number;
  preset: PeriodPreset;
  customStart: string;
  customEnd: string;
  onChange: (year: number, month: number, preset: PeriodPreset) => void;
  onCustomChange: (start: string, end: string) => void;
}

export function PeriodSelector({
  year,
  month,
  preset,
  customStart,
  customEnd,
  onChange,
  onCustomChange,
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState(customStart);
  const [tempEnd, setTempEnd] = useState(customEnd);
  const [pickerYear, setPickerYear] = useState(year);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      setPickerYear(year);
    }, 0);
  }, [year]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // ── Navigation functions per preset ───────────────────────────────────────
  function go(direction: -1 | 1) {
    if (preset === 'month') {
      let m = month + direction;
      let y = year;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      onChange(y, m, 'month');
    } else if (preset === '3m') {
      // Shift anchor by 3 months
      let m = month + direction * 3;
      let y = year;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      // Don't allow future
      const now = new Date();
      if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return;
      onChange(y, m, '3m');
    } else if (preset === 'cfy') {
      // Move to previous FY (becomes lfy-equivalent, but we shift the anchor year)
      const { fyStartY } = fyFromAnchor(year, month);
      const newFyStartY = fyStartY + direction;
      const now = new Date();
      const curFy = fyFromAnchor(now.getFullYear(), now.getMonth() + 1);
      // Don't go into the future
      if (newFyStartY > curFy.fyStartY) return;
      // Represent new FY by its start anchor: April of newFyStartY
      onChange(newFyStartY, FY_START_MONTH, newFyStartY === curFy.fyStartY ? 'cfy' : 'cfy');
    } else if (preset === 'lfy') {
      const { fyStartY } = fyFromAnchor(year, month);
      const newFyStartY = fyStartY + direction;
      // Stay in lfy equivalent (non-current FY)
      onChange(newFyStartY, FY_START_MONTH, 'lfy');
    }
  }

  function canGoForward(): boolean {
    const now = new Date();
    if (preset === 'month') {
      return !(year === now.getFullYear() && month === now.getMonth() + 1);
    }
    if (preset === '3m') {
      return !(year === now.getFullYear() && month === now.getMonth() + 1);
    }
    if (preset === 'cfy') {
      const { fyStartY } = fyFromAnchor(year, month);
      const curFy = fyFromAnchor(now.getFullYear(), now.getMonth() + 1);
      return fyStartY < curFy.fyStartY;
    }
    return true; // lfy always allows forward
  }

  // ── Label helpers ─────────────────────────────────────────────────────────
  function buildLabel(): { main: string; sub?: string } {
    if (preset === 'month') {
      return { main: `${MONTHS[month - 1]} ${year}` };
    }
    if (preset === '3m') {
      const endM = month; // anchor = last month in window
      let startM = month - 2;
      let startY = year;
      if (startM < 1) { startM += 12; startY--; }
      if (startY === year) {
        return { main: `${MONTHS[startM - 1]} – ${MONTHS[endM - 1]} ${year}` };
      }
      return { main: `${MONTHS[startM - 1]} ${startY} – ${MONTHS[endM - 1]} ${year}` };
    }
    if (preset === 'cfy') {
      const { fyStartY } = fyFromAnchor(year, month);
      return { main: fyLabel(fyStartY) };
    }
    if (preset === 'lfy') {
      const { fyStartY } = fyFromAnchor(year, month);
      return { main: fyLabel(fyStartY) };
    }
    // custom
    return { main: 'Custom Range' };
  }

  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth() + 1;
  const label = buildLabel();
  const showArrows = preset !== 'custom';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
      {/* Prev arrow */}
      {showArrows && (
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => go(-1)}
          title="Previous period"
          style={{ padding: '0 4px' }}
        >
          <ChevronLeft size={13} />
        </button>
      )}

      {/* Period label button */}
      <button
        className="btn btn-secondary btn-sm"
        style={{ gap: 4, minWidth: 110, justifyContent: 'center', fontSize: 12, padding: '0 8px' }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontWeight: 600 }}>{label.main}</span>
        {label.sub && (
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1 }}>
            {label.sub}
          </span>
        )}
        <ChevronDown size={11} style={{ flexShrink: 0 }} />
      </button>

      {/* Next arrow */}
      {showArrows && (
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => go(1)}
          disabled={!canGoForward()}
          title="Next period"
          style={{ padding: '0 4px' }}
        >
          <ChevronRight size={13} />
        </button>
      )}

      {open && (
        <div className="sidebar-dropdown" style={{ right: 0, top: '110%', width: 232, zIndex: 200, padding: 8 }}>
          {/* Preset list */}
          {(['month', '3m', 'cfy', 'lfy', 'custom'] as PeriodPreset[]).map(p => (
            <div
              key={p}
              className={`sidebar-dropdown-item ${preset === p ? 'active' : ''}`}
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4 }}
              onClick={() => {
                if (p === 'cfy') {
                  const now = new Date();
                  onChange(now.getFullYear(), now.getMonth() + 1, 'cfy');
                  setOpen(false);
                } else if (p === 'lfy') {
                  const now = new Date();
                  const curFyStart = now.getMonth() + 1 >= FY_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
                  onChange(curFyStart - 1, FY_START_MONTH, 'lfy');
                  setOpen(false);
                } else if (p !== 'custom') {
                  onChange(year, month, p);
                  if (p !== 'month') setOpen(false);
                } else {
                  onChange(year, month, 'custom');
                }
              }}
            >
              {p === 'month' ? `${MONTHS[month - 1]} ${year}` :
               p === '3m' ? 'Last 3 Months' :
               p === 'cfy' ? 'Current FY' :
               p === 'lfy' ? 'Previous FY' : 'Custom Range'}
            </div>
          ))}

          {/* Jump-to-Month grid — shown when "month" preset is selected */}
          {preset === 'month' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8 }}>
              {/* Year navigator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ padding: 2 }}
                  onClick={() => setPickerYear(y => y - 1)}
                >
                  <ChevronLeft size={12} />
                </button>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{pickerYear}</span>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ padding: 2 }}
                  onClick={() => setPickerYear(y => y + 1)}
                  disabled={pickerYear >= nowY + 1}
                >
                  <ChevronRight size={12} />
                </button>
              </div>

              {/* Month grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                {MONTHS.map((mn, idx) => {
                  const mNum = idx + 1;
                  const isCurrent = pickerYear === year && mNum === month;
                  const isFuture = pickerYear > nowY || (pickerYear === nowY && mNum > nowM);
                  return (
                    <button
                      key={mn}
                      disabled={isFuture}
                      onClick={() => {
                        onChange(pickerYear, mNum, 'month');
                        setOpen(false);
                      }}
                      style={{
                        border: isCurrent ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                        background: isCurrent ? 'var(--accent)' : 'transparent',
                        color: isCurrent ? '#fff' : isFuture ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        borderRadius: 4,
                        padding: '4px 0',
                        fontSize: 11,
                        fontWeight: isCurrent ? 700 : 400,
                        cursor: isFuture ? 'not-allowed' : 'pointer',
                        opacity: isFuture ? 0.35 : 1,
                        transition: 'background 0.12s, color 0.12s',
                      }}
                    >
                      {mn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom date range */}
          {preset === 'custom' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Start Date</span>
                <DatePicker
                  className="form-input"
                  value={tempStart}
                  onChange={(val: string) => setTempStart(val)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>End Date</span>
                <DatePicker
                  className="form-input"
                  value={tempEnd}
                  onChange={(val: string) => setTempEnd(val)}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onCustomChange(tempStart, tempEnd);
                  setOpen(false);
                }}
                style={{ fontSize: 11, padding: '4px 8px', background: 'var(--green)', borderColor: 'var(--green)', color: '#fff', border: '1px solid var(--green)', width: '100%', borderRadius: 4 }}
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
