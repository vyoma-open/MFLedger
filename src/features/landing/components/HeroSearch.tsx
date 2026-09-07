import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Plus, Check, TrendingUp, ExternalLink, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SchemeSearchResult {
  schemeCode: number;
  schemeName: string;
}

const POPULAR_FUNDS = [
  { schemeCode: 122639, schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', category: 'Flexi Cap', returns5y: '22.8%' },
  { schemeCode: 120503, schemeName: 'Mirae Asset Large Cap Fund - Direct Plan - Growth', category: 'Large Cap', returns5y: '16.4%' },
  { schemeCode: 118989, schemeName: 'Nippon India Small Cap Fund - Direct Plan - Growth', category: 'Small Cap', returns5y: '29.6%' },
  { schemeCode: 120716, schemeName: 'Quant Small Cap Fund - Direct Plan - Growth', category: 'Small Cap', returns5y: '32.1%' },
  { schemeCode: 119598, schemeName: 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth', category: 'Mid Cap', returns5y: '24.2%' },
  { schemeCode: 120594, schemeName: 'SBI Contra Fund - Direct Plan - Growth', category: 'Contra / Value', returns5y: '26.7%' },
];

interface HeroSearchProps {
  onSelectScheme?: (schemeCode: number, schemeName: string) => void;
}

export function HeroSearch({ onSelectScheme }: HeroSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchemeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search via public MFAPI endpoint
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setResults(data.slice(0, 8));
          }
        }
      } catch (err) {
        console.error('MF search error:', err);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(schemeCode: number, schemeName: string) {
    if (onSelectScheme) {
      onSelectScheme(schemeCode, schemeName);
    } else {
      // Store in session and open portfolio or add lot
      sessionStorage.setItem('mf_prefill_code', String(schemeCode));
      sessionStorage.setItem('mf_prefill_name', schemeName);
      navigate('/');
    }
    setIsFocused(false);
  }

  function handleCopy(e: React.MouseEvent, code: number) {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(code));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  }

  return (
    <div className="lp-search-wrap" ref={dropdownRef}>
      <div className="lp-search-bar">
        <Search size={18} className="lp-search-icon" />
        <input
          id="hero-scheme-search"
          type="text"
          className="lp-search-input"
          placeholder="Search any fund — e.g. 'Parag Parikh', 'HDFC Mid Cap' or 'Nippon'..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          autoComplete="off"
          spellCheck="false"
        />
        {loading && <Loader2 size={16} className="anim-spin" style={{ color: 'var(--green)', marginRight: 6 }} />}
        {query && !loading && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Interactive Dropdown */}
      {isFocused && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            overflow: 'hidden',
            maxHeight: 380,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 16px',
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-tertiary)',
            }}
          >
            <span>{query ? `Search Results (${results.length})` : 'Popular Indian Mutual Funds'}</span>
            <span>Live AMFI Sync</span>
          </div>

          {/* List Items */}
          <div style={{ overflowY: 'auto', padding: '6px 0' }}>
            {query.trim().length >= 2 ? (
              results.length > 0 ? (
                results.map((item) => (
                  <div
                    key={item.schemeCode}
                    onClick={() => handleSelect(item.schemeCode, item.schemeName)}
                    style={{
                      padding: '11px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--t-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.schemeName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        AMFI: {item.schemeCode}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(e, item.schemeCode)}
                        title="Copy Scheme Code"
                        style={{
                          background: 'var(--surface-3)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          color: copiedCode === item.schemeCode ? 'var(--green)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedCode === item.schemeCode ? <Check size={12} /> : 'Code'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Plus size={13} />
                        <span>Track</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  {loading ? 'Searching AMFI schemes database...' : `No matching mutual fund schemes found for "${query}".`}
                </div>
              )
            ) : (
              POPULAR_FUNDS.map((fund) => (
                <div
                  key={fund.schemeCode}
                  onClick={() => handleSelect(fund.schemeCode, fund.schemeName)}
                  style={{
                    padding: '11px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background var(--t-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fund.schemeName}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 126, 209, 0.12)', color: 'var(--blue)', fontWeight: 600 }}>
                        {fund.category}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <TrendingUp size={11} /> 5Y: {fund.returns5y}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        #{fund.schemeCode}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>Track</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
