import { useState } from 'react';
import { Sheet } from '../primitives/Sheet';
import { DeliveryPackage, formatMoney } from '../lib/api';

const PRICES = [450, 475, 500, 525, 550, 575, 600];

export function OfferSheet({
  open,
  onClose,
  packages,
  initialPrice = 525,
  initialPackage = 'phased',
  roleId,
  onSubmit,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  packages: DeliveryPackage[];
  initialPrice?: number;
  initialPackage?: 'phased' | 'full-6' | 'full-8';
  roleId: 'alex' | 'morgan';
  onSubmit: (deal: { price: number; package: 'phased' | 'full-6' | 'full-8' }) => void;
  busy?: boolean;
}) {
  const [price, setPrice] = useState<number>(PRICES.includes(initialPrice) ? initialPrice : 525);
  const [pkgId, setPkgId] = useState<'phased' | 'full-6' | 'full-8'>(initialPackage);

  const pkg = packages.find(p => p.id === pkgId) || packages[0];
  const idx = PRICES.indexOf(price);

  const cyclePkg = () => {
    const next = packages[(packages.findIndex(p => p.id === pkgId) + 1) % packages.length];
    if (next) setPkgId(next.id);
  };

  // Private objective preview for the current player only
  const priceMet = roleId === 'alex' ? price >= 550 : price <= 500;
  const schedMet = roleId === 'alex' ? pkg.full === 8 : pkg.first <= 6;
  const goalsCount = 1 + (priceMet ? 1 : 0) + (schedMet ? 1 : 0);

  return (
    <Sheet open={open} onClose={onClose} title="Structure shared proposal">
      <div className="offer-builder">
        {/* Wise-style amount header */}
        <div className="flow-amount-head compact">
          <div>
            <div className="flow-caption">Contract value · USD</div>
            <button type="button" className="flow-currency-pill" onClick={cyclePkg}>
              <span className="pill-dot" />
              <span>{pkg.name}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          <div className="price-stepper">
            <button
              type="button"
              className="step-btn"
              onClick={() => idx > 0 && setPrice(PRICES[idx - 1])}
              disabled={idx <= 0}
              aria-label="Decrease price by $0.25M"
            >
              −
            </button>
            <span className="flow-big-figure display tnum">{formatMoney(price)}</span>
            <button
              type="button"
              className="step-btn"
              onClick={() => idx < PRICES.length - 1 && setPrice(PRICES[idx + 1])}
              disabled={idx >= PRICES.length - 1}
              aria-label="Increase price by $0.25M"
            >
              +
            </button>
          </div>
        </div>

        {/* Quick price chips */}
        <div className="price-chip-grid" role="group" aria-label="Select contract price">
          {PRICES.map(p => (
            <button
              key={p}
              type="button"
              className={`price-chip tnum${p === price ? ' is-selected' : ''}`}
              onClick={() => setPrice(p)}
            >
              {formatMoney(p)}
            </button>
          ))}
        </div>

        {/* Wise-style rows */}
        <div className="flow-summary-list">
          <div className="flow-summary-row">
            <span className="summary-circle is-blue" aria-hidden="true">📦</span>
            <div className="summary-text">
              <span className="summary-label">Delivery schedule</span>
              <strong>{pkg.name}</strong>
              <small>{pkg.detail}</small>
            </div>
            <button type="button" className="wise-change-pill" onClick={cyclePkg}>Change</button>
          </div>

          <div className="flow-summary-row">
            <span className="summary-circle is-orange" aria-hidden="true">🎯</span>
            <div className="summary-text">
              <span className="summary-label">Private brief alignment (eyes only)</span>
              <strong>{goalsCount} of 3 mission goals satisfied ({goalsCount * 20} pts)</strong>
              <small>
                Deal (+20) · Price {priceMet ? '✓ (+20)' : '✗ (0)'} · Schedule {schedMet ? '✓ (+20)' : '✗ (0)'}
              </small>
            </div>
          </div>
        </div>

        <div className="offer-sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="wise-cta-wide"
            disabled={busy}
            onClick={() => onSubmit({ price, package: pkgId })}
          >
            {busy ? 'Sending…' : `Table ${formatMoney(price)} proposal`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
