import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { AssetClass } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { MF_LABELS } from './AddLotModal';

export interface EditAssetModalProps {
  symbol: string;
  accountId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditAssetModal({ symbol, accountId, onClose, onUpdate }: EditAssetModalProps) {
  const { toast } = useToast();
  const accounts = useLiveQuery(() => db.accounts.where('deleted_at').equals(0).filter(a => a.type === 'MF').toArray(), []);

  const existingLots = useLiveQuery(() => db.investment_lots.where('symbol').equals(symbol).filter(l => l.account_id === accountId).toArray(), [symbol, accountId]);

  const [form, setForm] = useState({
    account_id: accountId,
    symbol: symbol,
    name: '',
    asset_class: 'EQUITY_MF' as AssetClass,
    mf_plan: 'DIRECT' as 'DIRECT' | 'REGULAR',
    mf_option: 'GROWTH' as 'GROWTH' | 'IDCW',
    isin: '',
    goal_tag: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existingLots && existingLots.length > 0) {
      const lot = existingLots[0];
      setTimeout(() => {
        setForm({
          account_id: accountId,
          symbol: symbol,
          name: lot.name || symbol,
          asset_class: lot.asset_class,
          mf_plan: lot.mf_plan || 'DIRECT',
          mf_option: lot.mf_option || 'GROWTH',
          isin: lot.isin || '',
          goal_tag: lot.goal_tag || '',
        });
      }, 0);
    }
  }, [existingLots, symbol, accountId]);

  const classes: AssetClass[] = ['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'];
  const goalOptions = ['Home Purchase', 'Vehicle / Car', 'Retirement Fund', 'Children Education', 'Emergency Fund', 'Wealth Creation'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.account_id || !form.symbol) {
      toast('Fill required fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      const lotsToUpdate = await db.investment_lots.where('symbol').equals(symbol).filter(l => l.account_id === accountId).toArray();
      await db.transaction('rw', db.investment_lots, async () => {
        for (const lot of lotsToUpdate) {
          await db.investment_lots.update(lot.id, {
            account_id: form.account_id,
            symbol: form.symbol.toUpperCase(),
            name: form.name.trim() || form.symbol.toUpperCase(),
            asset_class: form.asset_class,
            mf_plan: form.mf_plan,
            mf_option: form.mf_option,
            isin: form.isin.trim() || undefined,
            goal_tag: form.goal_tag.trim() || undefined,
            updated_at: Date.now(),
            version: lot.version + 1,
          });
        }
      });
      toast('Asset details updated successfully!', 'success');
      if (onUpdate) onUpdate();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to update asset.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const isMF = ['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'].includes(form.asset_class);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 460 }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Edit Scheme / Asset Details</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Asset Class</label>
            <select className="form-select" value={form.asset_class} onChange={e => setForm(f => ({ ...f, asset_class: e.target.value as AssetClass }))}>
              {classes.map(c => <option key={c} value={c}>{MF_LABELS[c]}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Scheme Symbol / AMFI Code *</label>
              <input className="form-input" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} required placeholder="e.g. AMFI:135762" />
            </div>
            <div className="form-group">
              <label className="form-label">ISIN Code</label>
              <input className="form-input" value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="e.g. INF846K01WO1" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Fund / Scheme Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {isMF && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Plan Type</label>
                <select className="form-select" value={form.mf_plan} onChange={e => setForm(f => ({ ...f, mf_plan: e.target.value as any }))}>
                  <option value="DIRECT">Direct Plan</option>
                  <option value="REGULAR">Regular Plan</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Option Type</label>
                <select className="form-select" value={form.mf_option} onChange={e => setForm(f => ({ ...f, mf_option: e.target.value as any }))}>
                  <option value="GROWTH">Growth Option</option>
                  <option value="IDCW">IDCW (Dividend)</option>
                </select>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Target Goal (Tracking & Overview)</label>
            <input 
              className="form-input" 
              list="goal-suggestions"
              value={form.goal_tag} 
              onChange={e => setForm(f => ({ ...f, goal_tag: e.target.value }))} 
              placeholder="e.g. Home Purchase, Vehicle, Retirement"
            />
            <datalist id="goal-suggestions">
              {goalOptions.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>

          <div className="modal-footer" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
