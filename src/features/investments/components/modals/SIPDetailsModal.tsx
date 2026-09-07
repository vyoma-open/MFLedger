import React, { useState } from 'react';
import { X, Pencil, Pause, Play, Trash2, Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { InvestmentLot, Account, RecurringTemplate } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { formatINR } from '@/utils/currency';
import { calculateXIRR } from '@/utils/xirr';
import { formatDate } from '@/utils/fiscalYear';
import { ConfirmModal } from '@/components/ConfirmModal';
import { EditSIPModal } from './EditSIPModal';
import { EditLotModal } from './EditLotModal';
import { AddSIPTransactionModal } from './AddSIPTransactionModal';

interface SIPDetailsModalProps {
  sipId: string;
  onClose: () => void;
}

export function SIPDetailsModal({ sipId, onClose }: SIPDetailsModalProps) {
  const { toast } = useToast();
  const [selectedLot, setSelectedLot] = useState<InvestmentLot | null>(null);
  const [deleteLotId, setDeleteLotId] = useState<string | null>(null);
  const [showEditSip, setShowEditSip] = useState(false);
  const [showDeleteSip, setShowDeleteSip] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  const data = useLiveQuery<{
    sip: RecurringTemplate;
    symbol: string;
    toAcc: Account | null;
    activeLots: InvestmentLot[];
    currentPrice: number | null;
    navDate: number | null;
    name: string;
  } | null>(async () => {
    const sip = await db.recurring_templates.get(sipId);
    if (!sip) return null;

    const symbol = sip.name.replace(/ SIP$/i, '').trim().toUpperCase();
    const toAcc = sip.to_account_id ? ((await db.accounts.get(sip.to_account_id)) ?? null) : null;

    const activeLots = await db.investment_lots
      .where('[symbol+status]')
      .equals([symbol, 'ACTIVE'])
      .filter(l => sip.to_account_id ? l.account_id === sip.to_account_id : true)
      .toArray();

    const cached = await db.market_cache.where('symbol').equals(symbol).toArray();
    cached.sort((a, b) => b.nav_date - a.nav_date);
    const currentPrice = cached[0]?.nav_paise ?? null;
    const navDate = cached[0]?.nav_date ?? null;
    const name = cached[0]?.name ?? (activeLots[0]?.name || symbol);

    return { sip, symbol, toAcc, activeLots, currentPrice, navDate, name };
  }, [sipId]);

  if (!data || !data.sip) return null;

  const { sip, symbol, toAcc, activeLots, currentPrice, navDate, name } = data;

  async function handleDeleteConfirm() {
    if (!deleteLotId) return;
    try {
      await db.investment_lots.delete(deleteLotId);
      toast('Lot deleted successfully.', 'success');
    } catch (err) {
      toast('Failed to delete lot.', 'error');
    }
    setDeleteLotId(null);
  }

  async function handleDeleteSipConfirm() {
    try {
      await db.recurring_templates.delete(sipId);
      toast('SIP schedule deleted successfully.', 'success');
      onClose();
    } catch (err) {
      toast('Failed to delete SIP schedule.', 'error');
    }
  }

  const unitsRemaining = activeLots.reduce((sum: number, l: InvestmentLot) => sum + l.units_remaining, 0);
  const totalInvestedValue = activeLots.reduce((sum: number, l: InvestmentLot) => sum + (l.units_remaining * l.purchase_price_paise), 0);
  const averageCost = unitsRemaining > 0 ? Math.round(totalInvestedValue / unitsRemaining) : 0;
  const resolvedCurrentPrice = currentPrice ?? averageCost;
  const currentValue = unitsRemaining * resolvedCurrentPrice;
  const totalGain = currentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGain / totalInvestedValue) * 100 : 0;

  const isActive = sip.is_active === 1;

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 640, width: '90%' }}>
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="modal-title" style={{ fontSize: 16 }}>{symbol} SIP Details</h2>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Systematic plan and recorded transactions</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setShowEditSip(true)}
              style={{
                border: '1px solid var(--purple)',
                background: 'rgba(139, 92, 246, 0.1)',
                color: 'var(--purple)',
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.3)',
                padding: '4px',
                borderRadius: '8px'
              }}
              title="Edit SIP Details"
            >
              <Pencil size={14} />
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={async () => {
                try {
                  const nextActive = sip.is_active === 1 ? 0 : 1;
                  await db.recurring_templates.update(sip.id, {
                    is_active: nextActive,
                    updated_at: Date.now()
                  });
                  toast(nextActive === 1 ? 'SIP Schedule resumed.' : 'SIP Schedule paused.', 'success');
                } catch (err) {
                  toast('Failed to change status.', 'error');
                }
              }}
              style={{
                color: sip.is_active === 1 ? 'var(--text-secondary)' : 'var(--green)',
                padding: '4px',
                borderRadius: '8px'
              }}
              title={sip.is_active === 1 ? 'Pause SIP' : 'Resume SIP'}
            >
              {sip.is_active === 1 ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setShowDeleteSip(true)}
              style={{
                color: 'var(--red)',
                padding: '4px',
                borderRadius: '8px'
              }}
              title="Delete SIP Schedule"
            >
              <Trash2 size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* SIP Info Card */}
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{sip.description}</span>
            <span className={`badge ${isActive ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize: 9 }}>
              {isActive ? 'Active SIP' : 'Paused SIP'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Installment</div>
              <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {formatINR(sip.amount_paise)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frequency</div>
              <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginTop: 4 }}>
                {sip.frequency}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Due</div>
              <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {formatDate(sip.next_execution)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio Account</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {toAcc?.name || 'MF Portfolio'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
            <div style={{ fontSize: 11 }}>
              <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Total Units Accum.:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{unitsRemaining.toFixed(3)}</span>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11 }}>
              <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Total Invested:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatINR(totalInvestedValue)}</span>
            </div>
          </div>
        </div>

        {/* SIP recorded transactions table */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>Recorded Purchase Lots</h3>
          {activeLots?.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddTransaction(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', height: 24, fontSize: 11, color: 'var(--purple)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
              <Plus size={12} /> Add Purchase
            </button>
          )}
        </div>
        {!activeLots?.length ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span>No purchase lots recorded yet under this SIP.</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddTransaction(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> Record First Purchase
            </button>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Purchase Date</th>
                  <th className="r">Units</th>
                  <th className="r">NAV Price</th>
                  {activeLots.some((l: InvestmentLot) => l.fees_paise > 0) && <th className="r">Fees</th>}
                  <th className="r">Total Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeLots.map((l: InvestmentLot) => {
                  const cost = l.units_original * l.purchase_price_paise + l.fees_paise;
                  const showFeesCol = activeLots.some((lot: InvestmentLot) => lot.fees_paise > 0);
                  return (
                    <tr key={l.id}>
                      <td className="num td-dim">{formatDate(l.purchase_date)}</td>
                      <td className="r num">{l.units_original.toFixed(3)}</td>
                      <td className="r num">{formatINR(l.purchase_price_paise, { decimals: 2 })}</td>
                      {showFeesCol && <td className="r num">{l.fees_paise > 0 ? formatINR(l.fees_paise) : '—'}</td>}
                      <td className="r num" style={{ fontWeight: 500 }}>{formatINR(cost)}</td>
                      <td>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedLot(l)}>
                            <Pencil size={11} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteLotId(l.id)}>
                            <Trash2 size={11} color="var(--red)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showEditSip && (
          <EditSIPModal
            sip={sip}
            onClose={() => setShowEditSip(false)}
          />
        )}

        {showDeleteSip && (
          <ConfirmModal
            title="Delete SIP Schedule"
            message="Are you sure you want to delete this scheduled SIP? Active purchase lots will not be deleted."
            onConfirm={handleDeleteSipConfirm}
            onCancel={() => setShowDeleteSip(false)}
          />
        )}

        {selectedLot && (
          <EditLotModal
            lot={selectedLot}
            onClose={() => setSelectedLot(null)}
            onUpdate={() => { }}
          />
        )}

        {deleteLotId && (
          <ConfirmModal
            title="Delete Purchase Lot"
            message="Are you sure you want to delete this purchase lot? This cannot be undone."
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteLotId(null)}
          />
        )}

        {showAddTransaction && (
          <AddSIPTransactionModal
            sip={sip}
            symbol={symbol}
            onClose={() => setShowAddTransaction(false)}
          />
        )}
      </div>
    </div>
  );
}
