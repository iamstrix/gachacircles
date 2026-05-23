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
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1000;
      font-family: 'Outfit', sans-serif;
      color: #fff;
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
      padding: 8px 28px;
      border-radius: 14px;
      background: rgba(10, 10, 30, 0.55);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-shadow: 0 0 10px rgba(0,0,0,0.6);
      white-space: nowrap;
    }
    .ghud-name-cryo {
      background: ${CRYO_GRADIENT};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .ghud-name-pyro {
      background: ${PYRO_GRADIENT};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .ghud-vs {
      opacity: 0.7;
      font-size: 14px;
    }

    /* ── Health Bars ─────────────────────── */
    .ghud-hp-wrap {
      position: absolute;
      top: 58px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 220px;
    }
    .ghud-hp-wrap.left  { left: 24px; }
    .ghud-hp-wrap.right { right: 24px; text-align: right; }

    .ghud-hp-label {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.7;
      display: flex;
      justify-content: space-between;
    }
    .ghud-hp-bar-bg {
      width: 100%;
      height: 14px;
      border-radius: 7px;
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
      position: relative;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .ghud-hp-bar-fill {
      height: 100%;
      border-radius: 7px;
      transition: width 0.35s cubic-bezier(.4,0,.2,1);
      position: relative;
    }
    .ghud-hp-bar-fill.cryo { background: ${CRYO_GRADIENT}; box-shadow: 0 0 10px ${CRYO_COLOR}44; }
    .ghud-hp-bar-fill.pyro { background: ${PYRO_GRADIENT}; box-shadow: 0 0 10px ${PYRO_COLOR}44; }

    .ghud-hp-bar-fill::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 50%;
      background: linear-gradient(180deg, rgba(255,255,255,0.25), transparent);
      border-radius: 7px 7px 0 0;
    }

    /* ── Stats ────────────────────────────── */
    .ghud-stats {
      position: absolute;
      bottom: 18px;
      display: flex;
      gap: 14px;
      padding: 6px 16px;
      border-radius: 10px;
      background: rgba(10, 10, 30, 0.5);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.06);
      font-size: 12px;
      font-weight: 600;
    }
    .ghud-stats.left  { left: 24px; }
    .ghud-stats.right { right: 24px; }

    .ghud-stat-val {
      font-weight: 800;
    }
    .ghud-stat-val.cryo { color: ${CRYO_COLOR}; }
    .ghud-stat-val.pyro { color: ${PYRO_COLOR}; }

    /* ── Skill Cooldown Indicator ────────── */
    .ghud-skill {
      position: absolute;
      top: 90px;
      width: 32px;
      height: 32px;
    }
    .ghud-skill.left  { left: 250px; }
    .ghud-skill.right { right: 250px; }

    .ghud-skill svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .ghud-skill-bg {
      fill: none;
      stroke: rgba(255,255,255,0.1);
      stroke-width: 3;
    }
    .ghud-skill-fg {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.15s linear;
    }
    .ghud-skill-fg.cryo { stroke: ${CRYO_COLOR}; filter: drop-shadow(0 0 4px ${CRYO_COLOR}88); }
    .ghud-skill-fg.pyro { stroke: ${PYRO_COLOR}; filter: drop-shadow(0 0 4px ${PYRO_COLOR}88); }

    .ghud-skill-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
    }

    .ghud-skill-ready {
      animation: ghud-pulse 0.8s ease-in-out infinite alternate;
    }
    @keyframes ghud-pulse {
      from { opacity: 0.7; transform: scale(1); }
      to   { opacity: 1;   transform: scale(1.15); }
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
    document.body.appendChild(this.root);

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
      <div>DMG <span class="ghud-stat-val ${element}" data-stat="dmg">0</span></div>
      <div>SPD <span class="ghud-stat-val ${element}" data-stat="spd">1.0x</span></div>
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
