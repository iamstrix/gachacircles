// ─────────────────────────────────────────────────────────────
// HUD.js – DOM-based heads-up display overlay for Gacha Circles
// Glassmorphism panels, health bars, stats, skill cooldowns.
// ─────────────────────────────────────────────────────────────

const CRYO_COLOR = '#5ed4fc';
const CRYO_GRADIENT = 'linear-gradient(90deg, #5ed4fc, #1a6dd4)';
const PYRO_COLOR = '#ff8c32';
const PYRO_GRADIENT = 'linear-gradient(90deg, #d42020, #ff8c32)';

/**
 * Inject the Outfit Google Font.
 */
function injectFont() {
  if (document.getElementById('gacha-font-link')) return;
  const link = document.createElement('link');
  link.id = 'gacha-font-link';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap';
  document.head.appendChild(link);
}

/**
 * Inject shared HUD styles.
 */
function injectStyles() {
  if (document.getElementById('gacha-hud-styles')) return;
  const style = document.createElement('style');
  style.id = 'gacha-hud-styles';
  style.textContent = `
    #gacha-hud {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1000;
      font-family: 'Outfit', sans-serif;
      color: #000;
      user-select: none;
    }
    #gacha-hud * {
      box-sizing: border-box;
    }

    /* ── Top Banner ──────────────────────── */
    .ghud-banner {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 24px;
      font-weight: 900;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ghud-name-cryo {
      color: #00bcd4; /* cyan */
      -webkit-text-stroke: 1.5px #000;
      text-shadow: 2px 2px 0px #000;
    }
    .ghud-name-pyro {
      color: #ff3333; /* red */
      -webkit-text-stroke: 1.5px #000;
      text-shadow: 2px 2px 0px #000;
    }
    .ghud-vs {
      color: #000;
      font-size: 18px;
      font-weight: 900;
    }

    /* ── Health Bars (Hidden to match simple aesthetic) ─────────────────────── */
    .ghud-hp-wrap {
      display: none !important;
    }

    /* ── Stats ────────────────────────────── */
    .ghud-stats {
      position: absolute;
      bottom: 12px;
      display: flex;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .ghud-stats.left {
      left: 24px;
      color: #00bcd4; /* cyan */
      -webkit-text-stroke: 1px #000;
      text-shadow: 1.5px 1.5px 0px #000;
    }
    .ghud-stats.right {
      right: 24px;
      color: #ff3333; /* red */
      -webkit-text-stroke: 1px #000;
      text-shadow: 1.5px 1.5px 0px #000;
    }

    .ghud-stat-val {
      font-weight: 900;
    }
    .ghud-stat-val.cryo { color: #00bcd4; }
    .ghud-stat-val.pyro { color: #ff3333; }

    /* ── Skill Cooldown (Hidden to match simple aesthetic) ────────── */
    .ghud-skill {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────

const CIRCUM = 2 * Math.PI * 13; // SVG circle radius = 13

export class HUD {
  constructor() {
    injectFont();
    injectStyles();

    this.root = document.createElement('div');
    this.root.id = 'gacha-hud';
    const container = document.getElementById('game-container') || document.body;
    container.appendChild(this.root);

    this._buildBanner();
    this._buildHP('cryo', 'left');
    this._buildHP('pyro', 'right');
    this._buildStats('cryo', 'left');
    this._buildStats('pyro', 'right');
    this._buildSkill('cryo', 'left');
    this._buildSkill('pyro', 'right');
  }

  // ── Build helpers ────────────────────────────────────────

  _buildBanner() {
    const d = document.createElement('div');
    d.className = 'ghud-banner';
    d.innerHTML = `
      <span class="ghud-name-cryo">Ayaka ❄️</span>
      <span class="ghud-vs">VS</span>
      <span class="ghud-name-pyro">🔥 Yoimiya</span>
    `;
    this.root.appendChild(d);
  }

  _buildHP(element, side) {
    const wrap = document.createElement('div');
    wrap.className = `ghud-hp-wrap ${side}`;
    const label = document.createElement('div');
    label.className = 'ghud-hp-label';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = element === 'cryo' ? 'Ayaka' : 'Yoimiya';
    const hpSpan = document.createElement('span');
    hpSpan.textContent = '100 / 100';
    label.appendChild(nameSpan);
    label.appendChild(hpSpan);

    const barBg = document.createElement('div');
    barBg.className = 'ghud-hp-bar-bg';
    const fill = document.createElement('div');
    fill.className = `ghud-hp-bar-fill ${element}`;
    fill.style.width = '100%';
    barBg.appendChild(fill);

    wrap.appendChild(label);
    wrap.appendChild(barBg);
    this.root.appendChild(wrap);

    // Store references
    this[`_hp_${element}_fill`] = fill;
    this[`_hp_${element}_text`] = hpSpan;
  }

  _buildStats(element, side) {
    const d = document.createElement('div');
    d.className = `ghud-stats ${side}`;
    d.innerHTML = `
      Damage/Speed: <span class="ghud-stat-val ${element}" data-stat="dmg">0</span> / <span class="ghud-stat-val ${element}" data-stat="spd">1.0x</span>
    `;
    this.root.appendChild(d);
    this[`_stats_${element}`] = d;
  }

  _buildSkill(element, side) {
    const d = document.createElement('div');
    d.className = `ghud-skill ${side}`;
    d.innerHTML = `
      <svg viewBox="0 0 32 32">
        <circle class="ghud-skill-bg" cx="16" cy="16" r="13"/>
        <circle class="ghud-skill-fg ${element}" cx="16" cy="16" r="13"
                stroke-dasharray="${CIRCUM}"
                stroke-dashoffset="0"/>
      </svg>
      <div class="ghud-skill-label">E</div>
    `;
    this.root.appendChild(d);
    this[`_skill_${element}_fg`] = d.querySelector('.ghud-skill-fg');
    this[`_skill_${element}_label`] = d.querySelector('.ghud-skill-label');
    this[`_skill_${element}_wrap`] = d;
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Update the HP bar for a fighter.
   *
   * @param {'cryo'|'pyro'} fighter
   * @param {number} currentHP
   * @param {number} maxHP
   */
  updateHP(fighter, currentHP, maxHP) {
    const pct = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
    this[`_hp_${fighter}_fill`].style.width = `${pct}%`;
    this[`_hp_${fighter}_text`].textContent = `${Math.round(currentHP)} / ${Math.round(maxHP)}`;
  }

  /**
   * Update bottom stats for a fighter.
   *
   * @param {'cryo'|'pyro'} fighter
   * @param {number} damage
   * @param {number|string} attackSpeed
   */
  updateStats(fighter, damage, attackSpeed) {
    const wrap = this[`_stats_${fighter}`];
    if (!wrap) return;
    const dmg = wrap.querySelector('[data-stat="dmg"]');
    const spd = wrap.querySelector('[data-stat="spd"]');
    if (dmg) dmg.textContent = String(damage);
    if (spd) spd.textContent = typeof attackSpeed === 'number' ? `${attackSpeed.toFixed(1)}x` : attackSpeed;
  }

  /**
   * Show skill as "ready" with pulsing animation.
   *
   * @param {'cryo'|'pyro'} fighter
   */
  showSkillReady(fighter) {
    const fg = this[`_skill_${fighter}_fg`];
    const label = this[`_skill_${fighter}_label`];
    const wrap = this[`_skill_${fighter}_wrap`];
    fg.style.strokeDashoffset = '0';
    label.textContent = 'E';
    wrap.classList.add('ghud-skill-ready');
  }

  /**
   * Update the circular cooldown indicator.
   *
   * @param {'cryo'|'pyro'} fighter
   * @param {number} remaining – seconds remaining
   * @param {number} total     – total cooldown seconds
   */
  updateSkillCooldown(fighter, remaining, total) {
    const fg = this[`_skill_${fighter}_fg`];
    const label = this[`_skill_${fighter}_label`];
    const wrap = this[`_skill_${fighter}_wrap`];

    wrap.classList.remove('ghud-skill-ready');

    if (remaining <= 0) {
      this.showSkillReady(fighter);
      return;
    }

    const frac = remaining / total; // 1 = full cd, 0 = ready
    fg.style.strokeDashoffset = String(CIRCUM * (1 - frac));
    label.textContent = `${Math.ceil(remaining)}`;
  }

  /** Remove the HUD from the DOM. */
  destroy() {
    this.root.remove();
  }
}
