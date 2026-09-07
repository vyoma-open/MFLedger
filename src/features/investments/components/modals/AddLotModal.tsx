import React, { useState, useEffect } from 'react';
import { X, Zap, Search, Loader2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { AssetClass } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { generateId } from '@/utils/ids';
import { todayStr, parseDateStr } from '@/utils/fiscalYear';
import { DatePicker } from '@/components/ui/DatePicker';
import { buyLot } from '@/engines/fifo';
import { resolveMFSchemeCode, parsePlanAndOption } from '@/utils/marketService';
import { useAccount } from '@/contexts/AccountContext';

export const MF_LABELS: Record<AssetClass, string> = {
  EQUITY_MF: 'Equity MF',
  INDEX_MF: 'Index Fund',
  DEBT_MF: 'Debt MF',
  LIQUID_MF: 'Liquid MF',
  GOLD_MF: 'Gold MF',
};

interface AddLotModalProps {
  onClose: () => void;
  defaultClass?: AssetClass;
  allowedClasses?: AssetClass[];
  title?: string;
  accountTypes?: string[];
  accountId?: string;
}

export function AddLotModal({
  onClose,
  defaultClass = 'EQUITY_MF',
  allowedClasses,
  title: modalTitle,
  accountId,
}: AddLotModalProps) {
  const { toast } = useToast();
  const { selectedAccountId } = useAccount();

  const accounts = useLiveQuery(
    () => db.accounts.where('deleted_at').equals(0).toArray(),
    []
  );

  const [isSipMode, setIsSipMode] = useState(false);

  const [form, setForm] = useState({
    account_id: accountId || (selectedAccountId !== 'ALL' ? selectedAccountId : ''),
    profile_id: '',
    symbol: '',
    name: '',
    asset_class: defaultClass,
    purchase_date: todayStr(),
    units: '',
    price: '',
    fees: '',
    mf_plan: 'DIRECT' as 'DIRECT' | 'REGULAR',
    mf_option: 'GROWTH' as 'GROWTH' | 'IDCW',
    isin: '',
    ter: '',
    sip_amount: '',
    sip_frequency: 'MONTHLY' as const,
    sip_start_date: todayStr(),
  });
  const [loading, setLoading] = useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedField, setFocusedField] = useState<'symbol' | 'name' | null>(null);

  const searchVal = (focusedField === 'symbol' ? form.symbol : focusedField === 'name' ? form.name : '').trim();

  // Local suggestions from market_cache
  const suggestions = useLiveQuery(
    async () => {
      if (!searchVal || searchVal.length < 2) return [];

      const bySymbol = await db.market_cache
        .where('symbol')
        .startsWithIgnoreCase(searchVal)
        .limit(8)
        .toArray();

      const byName = await db.market_cache
        .where('name')
        .startsWithIgnoreCase(searchVal)
        .limit(8)
        .toArray();

      const map = new Map<string, any>();
      for (const item of [...bySymbol, ...byName]) {
        map.set(item.symbol.toUpperCase(), item);
      }
      return Array.from(map.values()).slice(0, 8);
    },
    [searchVal]
  );

  useEffect(() => {
    if (!form.account_id && accounts && accounts.length > 0) {
      const defaultId = (selectedAccountId && selectedAccountId !== 'ALL' && accounts.some(a => a.id === selectedAccountId))
        ? selectedAccountId
        : accounts[0].id;
      setForm(f => ({ ...f, account_id: defaultId }));
    }
  }, [accounts, form.account_id, selectedAccountId]);

  async function handleSearchOnline() {
    if (!searchVal || searchVal.length < 3) {
      toast('Enter at least 3 characters to search online', 'info');
      return;
    }
    setIsSearchingOnline(true);
    try {
      const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(searchVal)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          const { mfPlan, mfOption } = parsePlanAndOption(first.schemeName);
          setForm(f => ({
            ...f,
            symbol: `AMFI:${first.schemeCode}`,
            name: first.schemeName,
            mf_plan: mfPlan || f.mf_plan,
            mf_option: mfOption || f.mf_option,
          }));
          toast(`Found: ${first.schemeName}`, 'success');
        } else {
          toast('No funds found online matching query', 'info');
        }
      }
    } catch {
      toast('Online fund search failed', 'error');
    } finally {
      setIsSearchingOnline(false);
    }
  }

  function handleSelectSuggestion(item: any) {
    const sym = item.symbol.toUpperCase();
    const resolvedName = item.name || sym;
    const { mfPlan, mfOption } = parsePlanAndOption(resolvedName);

    setForm(f => ({
      ...f,
      symbol: sym,
      name: resolvedName,
      price: item.nav_paise ? (item.nav_paise / 100).toFixed(4) : f.price,
      mf_plan: mfPlan || f.mf_plan,
      mf_option: mfOption || f.mf_option,
    }));
    setShowSuggestions(false);
  }

  const classes = allowedClasses ?? ['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.account_id) return toast('Select a folio account.', 'error');
    if (!form.symbol) return toast('Enter scheme code or symbol.', 'error');

    if (isSipMode) {
      if (!form.sip_amount || isNaN(Number(form.sip_amount)) || Number(form.sip_amount) <= 0) {
        return toast('Enter a valid monthly SIP amount.', 'error');
      }

      setLoading(true);
      try {
        const now = Date.now();
        const amtPaise = Math.round(Number(form.sip_amount) * 100);
        const nextExec = parseDateStr(form.sip_start_date);

        await db.recurring_templates.add({
          id: generateId('sip'),
          name: form.name.trim() || form.symbol.trim().toUpperCase(),
          frequency: form.sip_frequency,
          amount_paise: amtPaise,
          to_account_id: form.account_id,
          description: `SIP for ${form.name.trim() || form.symbol.trim()}`,
          next_execution: nextExec,
          is_active: 1,
          created_at: now,
          updated_at: now,
          version: 1,
          asset_class: form.asset_class,
        });

        toast('SIP Schedule recorded successfully.', 'success');
        onClose();
      } catch (err: any) {
        toast(err.message ?? 'Failed to record SIP schedule.', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!form.units || isNaN(Number(form.units)) || Number(form.units) <= 0) {
      return toast('Enter valid units.', 'error');
    }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      return toast('Enter valid NAV.', 'error');
    }

    setLoading(true);
    try {
      const units = parseFloat(form.units);
      const price = parseFloat(form.price) * 100;
      const fees = form.fees ? Math.round(parseFloat(form.fees) * 100) : 0;
      const symUpper = form.symbol.trim().toUpperCase();

      const accountsList = await db.accounts.where('deleted_at').equals(0).toArray();
      const act = accountsList.find(a => a.id === form.account_id);
      const inputName = form.name.trim() || symUpper;

      const terNum = form.ter && !isNaN(Number(form.ter)) ? parseFloat(form.ter) : undefined;
      const expense_ratio_bps = terNum !== undefined ? Math.round(terNum * 100) : undefined;

      await buyLot({
        account_id: form.account_id,
        profile_id: form.profile_id || act?.profile_id || undefined,
        symbol: symUpper,
        name: inputName,
        asset_class: form.asset_class,
        purchase_date: parseDateStr(form.purchase_date),
        units,
        price_per_unit_paise: price,
        fees_paise: fees,
        mf_plan: form.mf_plan,
        mf_option: form.mf_option,
        isin: form.isin.trim() || undefined,
        investment_type: 'LUMPSUM',
        expense_ratio_bps,
        ter_pct: terNum,
      });

      onClose();
      toast('Mutual fund purchase recorded.', 'success');
    } catch (err: any) {
      toast(err.message ?? 'Failed to record purchase.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 520 }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>{isSipMode ? 'Record SIP Schedule' : (modalTitle ?? 'Add Mutual Fund Purchase')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                borderRadius: 16,
                fontSize: 11,
                padding: '4px 10px',
                background: isSipMode ? 'var(--blue)' : 'var(--surface-2)',
                color: isSipMode ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => setIsSipMode(!isSipMode)}
            >
              <Zap size={11} /> {isSipMode ? 'SIP Active' : 'Setup SIP'}
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-3">
            <label className="form-label">Portfolio Account</label>
            <select
              className="form-input"
              value={form.account_id}
              onChange={e => {
                const act = accounts?.find(a => a.id === e.target.value);
                setForm(f => ({ ...f, account_id: e.target.value, profile_id: act?.profile_id || f.profile_id }));
              }}
              required
            >
              <option value="">Select Portfolio Account</option>
              {accounts?.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group mb-3" style={{ position: 'relative' }}>
              <label className="form-label">AMFI Code / Symbol</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. AMFI:122639"
                value={form.symbol}
                onFocus={() => { setFocusedField('symbol'); setShowSuggestions(true); }}
                onChange={e => { setForm(f => ({ ...f, symbol: e.target.value })); setShowSuggestions(true); }}
                required
              />
            </div>

            <div className="form-group mb-3">
              <label className="form-label">Asset Category</label>
              <select
                className="form-input"
                value={form.asset_class}
                onChange={e => setForm(f => ({ ...f, asset_class: e.target.value as AssetClass }))}
              >
                {classes.map(c => (
                  <option key={c} value={c}>{MF_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group mb-3" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Fund Scheme Name</label>
              <button
                type="button"
                onClick={handleSearchOnline}
                disabled={isSearchingOnline}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--blue)',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: 0,
                  marginBottom: 2,
                }}
              >
                {isSearchingOnline ? <Loader2 size={11} className="spin" /> : <Search size={11} />} Search MFAPI
              </button>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Parag Parikh Flexi Cap Fund"
              value={form.name}
              onFocus={() => { setFocusedField('name'); setShowSuggestions(true); }}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setShowSuggestions(true); }}
            />

            {showSuggestions && suggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                {suggestions.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectSuggestion(item)}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name || item.symbol}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.symbol}</div>
                    </div>
                    {item.nav_paise && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--green)' }}>
                        ₹{(item.nav_paise / 100).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group mb-3">
              <label className="form-label">Plan</label>
              <select
                className="form-input"
                value={form.mf_plan}
                onChange={e => setForm(f => ({ ...f, mf_plan: e.target.value as any }))}
              >
                <option value="DIRECT">Direct</option>
                <option value="REGULAR">Regular</option>
              </select>
            </div>

            <div className="form-group mb-3">
              <label className="form-label">Option</label>
              <select
                className="form-input"
                value={form.mf_option}
                onChange={e => setForm(f => ({ ...f, mf_option: e.target.value as any }))}
              >
                <option value="GROWTH">Growth</option>
                <option value="IDCW">IDCW (Dividend)</option>
              </select>
            </div>

            <div className="form-group mb-3">
              <label className="form-label">ISIN Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="INF..."
                value={form.isin}
                onChange={e => setForm(f => ({ ...f, isin: e.target.value }))}
              />
            </div>
          </div>

          {isSipMode ? (
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Monthly SIP Amount (₹)</label>
                  <input
                    type="number"
                    step="100"
                    className="form-input"
                    placeholder="5000"
                    value={form.sip_amount}
                    onChange={e => setForm(f => ({ ...f, sip_amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">First Installment Date</label>
                  <DatePicker
                    value={form.sip_start_date}
                    onChange={d => setForm(f => ({ ...f, sip_start_date: d }))}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group mb-3">
                  <label className="form-label">Purchase Date</label>
                  <DatePicker
                    value={form.purchase_date}
                    onChange={d => setForm(f => ({ ...f, purchase_date: d }))}
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Units</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="e.g. 125.432"
                    value={form.units}
                    onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Purchase NAV (₹)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="e.g. 45.234"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div className="form-group mb-0">
                  <label className="form-label">Stamp Duty / Fees (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={form.fees}
                    onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">TER % (Total Expense Ratio)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    className="form-input"
                    placeholder="e.g. 0.75"
                    value={form.ter}
                    onChange={e => setForm(f => ({ ...f, ter: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : isSipMode ? 'Save SIP Schedule' : 'Record Purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
