import React, { useState, Suspense } from 'react';
import { Upload, FileText } from 'lucide-react';

const ImportCSVModal = React.lazy(() =>
  import('./ImportCSVModal').then(m => ({ default: m.ImportCSVModal }))
);
const ImportMarketDataModal = React.lazy(() =>
  import('./ImportMarketDataModal').then(m => ({ default: m.ImportMarketDataModal }))
);

export function ImportSection() {
  const [showModal, setShowModal] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ maxWidth: 640, marginTop: 8 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={18} color="var(--green)" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Mutual Fund CAS & Statement Importer</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Import mutual fund transactions and holdings from CAMS / KFintech Consolidated Account Statements (CAS PDF / Excel), Zerodha Coin, Groww, Kuvera, MF Central, and CSV statements.
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '10px', marginTop: 8 }}
            onClick={() => setShowModal(true)}
          >
            Launch Statement Importer
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 640 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={18} color="var(--blue)" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>AMFI Official NAV Importer</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Bulk update NAV valuation data for all mutual fund schemes using official AMFI NAVAll.txt files from the Association of Mutual Funds in India.
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '10px', marginTop: 8 }}
            onClick={() => setShowNavModal(true)}
          >
            Import AMFI NAV File
          </button>
        </div>
      </div>

      {showModal && (
        <Suspense fallback={null}>
          <ImportCSVModal onClose={() => setShowModal(false)} />
        </Suspense>
      )}

      {showNavModal && (
        <Suspense fallback={null}>
          <ImportMarketDataModal onClose={() => setShowNavModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
