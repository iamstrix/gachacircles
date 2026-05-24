// ─────────────────────────────────────────────────────────────
// DamageNumbers.js – Floating damage numbers (DOM-based)
// positioned over the PixiJS canvas. CSS-animated rise + fade.
// ─────────────────────────────────────────────────────────────

const CRYO_TEXT  = '#5ed4fc';
const PYRO_TEXT  = '#ff8c32';
const CRIT_CRYO  = '#b4e1fa';
const CRIT_PYRO  = '#ffd966';

function injectStyles() {
  if (document.getElementById('gacha-dmg-styles')) return;
  const style = document.createElement('style');
  style.id = 'gacha-dmg-styles';
  style.textContent = `
    .gdmg-container {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1001;
      overflow: hidden;
    }

    .gdmg-num {
      position: absolute;
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      white-space: nowrap;
      pointer-events: none;
      will-change: transform, opacity;
      text-shadow:
        0 0 6px rgba(0,0,0,0.8),
        0 1px 3px rgba(0,0,0,0.6);
      /* start state */
      opacity: 1;
      transform: translateY(0) scale(1);
      transition:
        transform 0.8s cubic-bezier(.2,.8,.3,1),
        opacity   0.8s ease-out;
    }

    .gdmg-num.rise {
      opacity: 0;
      transform: translateY(-60px) scale(0.7);
    }

    /* Crit variant: bigger + slight shake on spawn */
    .gdmg-num.crit {
      font-size: 28px;
      animation: gdmg-shake 0.15s ease-out 2;
    }

    @keyframes gdmg-shake {
      0%, 100% { transform: translateX(0); }
      25%  { transform: translateX(-4px) rotate(-2deg); }
      75%  { transform: translateX(4px) rotate(2deg); }
    }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────

export class DamageNumbers {
  constructor() {
    injectStyles();

    this._container = document.createElement('div');
    this._container.className = 'gdmg-container';
    document.body.appendChild(this._container);
  }

  /**
   * Spawn a floating damage number at canvas coordinates (x, y).
   *
   * @param {number} x        – canvas x position
   * @param {number} y        – canvas y position
   * @param {number} amount   – damage value
   * @param {'cryo'|'pyro'} element
   * @param {boolean} [isCrit=false]
   */
  spawn(x, y, amount, element, isCrit = false) {
    const el = document.createElement('div');
    el.className = 'gdmg-num' + (isCrit ? ' crit' : '');
    
    if (typeof amount === 'string') {
      el.textContent = amount;
    } else {
      el.textContent = String(Math.round(amount));
    }

    // Colours and sizing
    if (amount === 'MELT!') {
      el.style.color = '#ff1744'; // Sizzling pinkish-red Melt reaction color
      el.style.textShadow = '0 0 10px #ff1744, 0 0 2px #000';
      el.style.fontSize = '30px';
      el.style.fontWeight = '900';
    } else if (isCrit) {
      el.style.color = element === 'cryo' ? CRIT_CRYO : CRIT_PYRO;
      el.style.fontSize = '28px';
    } else {
      el.style.color = element === 'cryo' ? CRYO_TEXT : PYRO_TEXT;
      el.style.fontSize = '18px';
    }

    // Position – offset so the number is centred at (x, y)
    // We need to account for the canvas offset relative to the viewport
    const canvas = document.querySelector('canvas');
    let offsetX = 0;
    let offsetY = 0;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      offsetX = rect.left;
      offsetY = rect.top;
    }

    // Small random horizontal scatter
    const scatter = (Math.random() - 0.5) * 30;

    el.style.left = `${offsetX + x + scatter}px`;
    el.style.top  = `${offsetY + y}px`;

    this._container.appendChild(el);

    // Force reflow so the start state is painted before we trigger transition
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;

    // Trigger the rise + fade animation
    el.classList.add('rise');

    // Auto-remove after transition ends
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      el.remove();
    };
    el.addEventListener('transitionend', cleanup);

    // Fallback removal in case transitionend doesn't fire
    setTimeout(() => el.remove(), 1200);
  }

  /** Remove the container from the DOM. */
  destroy() {
    this._container.remove();
  }
}
