import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { InvestmentLot } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { generateId } from '@/utils/ids';
import { todayStr, parseDateStr } from '@/utils/fiscalYear';
import { DatePicker } from '@/components/ui/DatePicker';

interface EditLotModalProps {
  lot: InvestmentLot;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditLotModal({ lot, onClose, onUpdate }: EditLotModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    units: lot.units_original.toString(),
    price: (lot.purchase_price_paise / 100).toString(),
    fees: (lot.fees_paise / 100).toString(),
    purchase_date: (() => {
      const d = new Date(lot.purchase_date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    })(),
    investment_type: (lot.investment_type ?? 'LUMPSUM') as 'SIP' | 'LUMPSUM',
  });
  const [loading, setLoading] = useState(false);

  // Convert to SIP states
  const [convertToSip, setConvertToSip] = useState(false);
  const [sipForm, setSipForm] = useState({
    sip_amount: '',
    sip_frequency: 'MONTHLY',
    sip_start_date: todayStr(),
  });

  const syncSipAmount = (unitsVal: string, priceVal: string, enabled: boolean) => {
    if (!enabled) return;
    setSipForm(s => {
      if (!s.sip_amount) {
        return { ...s, sip_amount: (parseFloat(unitsVal || '0') * parseFloat(priceVal || '0')).toFixed(2) };
      }
      return s;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const units = parseFloat(form.units);
    const price = Math.round(parseFloat(form.price) * 100);
    const fees = form.fees ? Math.round(parseFloat(form.fees) * 100) : 0;

    if (isNaN(units) || isNaN(price)) {
      toast('Fill all required fields.', 'error');
      return;
    }

    if (convertToSip) {
      const amountPaise = Math.round(parseFloat(sipForm.sip_amount) * 100);
      if (isNaN(amountPaise) || amountPaise <= 0) {
        toast('Fill all required SIP conversion fields.', 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const diff = units - lot.units_original;
      const newRemaining = Math.max(0, lot.units_remaining + diff);

      // 1. Update existing lot
      await db.investment_lots.update(lot.id, {
        units_original: units,
        units_remaining: newRemaining,
        purchase_price_paise: price,
        fees_paise: fees,
        purchase_date: parseDateStr(form.purchase_date),
        investment_type: form.investment_type,
        status: newRemaining <= 0.0001 ? 'CLOSED' : 'ACTIVE',
        updated_at: Date.now(),
        version: lot.version + 1,
      });

      // 2. Create Recurring SIP template if checked
      if (convertToSip) {
        const amountPaise = Math.round(parseFloat(sipForm.sip_amount) * 100);
        const id = generateId('recur');
        await db.recurring_templates.add({
          id,
          name: `${lot.symbol.toUpperCase()} SIP`,
          frequency: sipForm.sip_frequency as any,
          amount_paise: amountPaise,
          to_account_id: lot.account_id,
          description: `SIP investment in ${lot.name || lot.symbol}`,
          next_execution: parseDateStr(sipForm.sip_start_date),
          is_active: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: 1,
        });
        toast('Lot updated and SIP schedule registered successfully!', 'success');
      } else {
        toast('Lot updated.', 'success');
      }

      onUpdate();
      onClose();
    } catch (err: any) {
      toast(err.message ?? 'Failed to update lot.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Lot: {lot.symbol}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Units *</label>
            <input
              type="number"
              step="0.001"
              className="form-input"
              value={form.units}
              onChange={e => {
                const val = e.target.value;
                setForm(f => ({ ...f, units: val }));
                syncSipAmount(val, form.price, convertToSip);
              }}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Purchase Price / NAV (₹) *</label>
            <div className="amount-input-wrapper">
              <span className="amount-input-prefix">₹</span>
              <input
                type="number"
                step="0.01"
                className="form-input amount-input"
                value={form.price}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, price: val }));
                  syncSipAmount(form.units, val, convertToSip);
                }}
                required
              />
            </div>
          </div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Purchase Date *</label>
              <DatePicker
                className="form-input"
                value={form.purchase_date}
                onChange={(val: string) => setForm(f => ({ ...f, purchase_date: val }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fees (₹)</label>
              <div className="amount-input-wrapper">
                <span className="amount-input-prefix">₹</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-input amount-input"
                  value={form.fees}
                  onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Investment Mode (SIP vs Lump Sum) */}
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label" style={{ fontSize: 12 }}>Investment Mode / Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className={`btn ${form.investment_type === 'SIP' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderColor: form.investment_type === 'SIP' ? 'var(--purple)' : undefined,
                  background: form.investment_type === 'SIP' ? 'var(--purple)' : undefined,
                  color: form.investment_type === 'SIP' ? '#fff' : undefined,
                  fontWeight: 600,
                  padding: '8px 12px',
                }}
                onClick={() => setForm(f => ({ ...f, investment_type: 'SIP' }))}
              >
                <span>⚡️ SIP</span>
              </button>
              <button
                type="button"
                className={`btn ${form.investment_type === 'LUMPSUM' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderColor: form.investment_type === 'LUMPSUM' ? 'var(--blue)' : undefined,
                  background: form.investment_type === 'LUMPSUM' ? 'var(--blue)' : undefined,
                  color: form.investment_type === 'LUMPSUM' ? '#fff' : undefined,
                  fontWeight: 600,
                  padding: '8px 12px',
                }}
                onClick={() => setForm(f => ({ ...f, investment_type: 'LUMPSUM' }))}
              >
                <span>💰 BULK</span>
              </button>
            </div>
          </div>

          {/* Convert to SIP Section */}
          {lot.asset_class.includes('MF') && (
            <div style={{
              borderTop: '1px solid var(--border-subtle)',
              marginTop: 16,
              paddingTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={convertToSip}
                  onChange={e => {
                    const checked = e.target.checked;
                    setConvertToSip(checked);
                    syncSipAmount(form.units, form.price, checked);
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--purple)',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Convert this holding lot into a recurring SIP schedule
                </span>
              </label>

              {convertToSip && (
                <div style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius)',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>


                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SIP Installment Amount (₹) *</label>
                    <div className="amount-input-wrapper">
                      <span className="amount-input-prefix">₹</span>
                      <input
                        type="number"
                        className="form-input amount-input"
                        placeholder="0.00"
                        value={sipForm.sip_amount}
                        onChange={e => setSipForm(s => ({ ...s, sip_amount: e.target.value }))}
                        required={convertToSip}
                      />
                    </div>
                  </div>

                  <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">SIP Frequency *</label>
                      <select
                        className="form-select"
                        value={sipForm.sip_frequency}
                        onChange={e => setSipForm(s => ({ ...s, sip_frequency: e.target.value }))}
                        required={convertToSip}
                      >
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Next Due Date *</label>
                      <DatePicker
                        className="form-input"
                        value={sipForm.sip_start_date}
                        onChange={(val: string) => setSipForm(s => ({ ...s, sip_start_date: val }))}
                        required={convertToSip}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="modal-footer" style={{ marginTop: 20 }}>
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
