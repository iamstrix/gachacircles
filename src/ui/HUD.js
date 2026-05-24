// ─────────────────────────────────────────────────────────────
// HUD.js – DOM-based heads-up display overlay for Gacha Circles
// Glassmorphism panels, health bars, stats, skill cooldowns.
// ─────────────────────────────────────────────────────────────

import { getCharacter } from '../characters/CharacterData.js';

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
      color: #00bcd4; /* vibrant cyan */
      -webkit-text-stroke: 1.5px #000;
      text-shadow: 2px 2px 0px #000, 0 0 10px rgba(0, 188, 212, 0.5);
    }
    .ghud-name-pyro {
      color: #ff3333; /* vibrant red */
      -webkit-text-stroke: 1.5px #000;
      text-shadow: 2px 2px 0px #000, 0 0 10px rgba(255, 51, 51, 0.5);
    }
    .ghud-vs {
      color: #000;
      font-size: 18px;
      font-weight: 900;
    }

    /* ── Health Bars (Active & Readable) ─────────────────────── */
    .ghud-hp-wrap {
      position: absolute;
      top: 48px;
      width: 220px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ghud-hp-wrap.left { left: 20px; }
    .ghud-hp-wrap.right { right: 20px; text-align: right; }

    .ghud-hp-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #000;
    }

    .ghud-hp-bar-bg {
      width: 100%;
      height: 12px;
      background: #fff;
      border: 2px solid #000;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    .ghud-hp-bar-fill {
      height: 100%;
      transition: width 0.3s ease;
    }
    .ghud-hp-bar-fill.cryo { background: #00bcd4; }
    .ghud-hp-bar-fill.pyro { background: #ff3333; }

    /* ── Stats ────────────────────────────── */
    .ghud-stats {
      position: absolute;
      bottom: 58px; /* Positioned directly above the action buttons */
      display: flex;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .ghud-stats.left {
      left: 60px;
      color: #00bcd4; /* cyan */
      -webkit-text-stroke: 1px #000;
      text-shadow: 1.5px 1.5px 0px #000;
    }
    .ghud-stats.right {
      right: 60px;
      color: #ff3333; /* red */
      -webkit-text-stroke: 1px #000;
      text-shadow: 1.5px 1.5px 0px #000;
    }

    .ghud-stat-val {
      font-weight: 900;
    }
    .ghud-stat-val.cryo { color: #00bcd4; }
    .ghud-stat-val.pyro { color: #ff3333; }

    /* ── Sidebars ────────────────────────── */
    .ghud-sidebar {
      position: absolute;
      bottom: 8px; /* Put them below the arena */
      display: flex;
      flex-direction: row; /* Horizontal row */
      align-items: center;
      gap: 12px;
      z-index: 1005;
    }
    .ghud-sidebar.left {
      left: 60px;
    }
    .ghud-sidebar.right {
      right: 60px;
      flex-direction: row-reverse; /* Mirrored layout on right side */
    }

    /* ── Action Buttons ──────────────────── */
    .ghud-action-btn {
      position: relative;
      width: 44px; /* Larger action buttons */
      height: 44px;
      border-radius: 50%;
      border: 2px solid #000;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      pointer-events: auto;
    }
    .ghud-action-name {
      position: absolute;
      top: -18px;
      font-size: 9px;
      font-weight: 900;
      color: #000;
      background: #ffd54f;
      padding: 1px 4px;
      border: 1.5px solid #000;
      border-radius: 4px;
      white-space: nowrap;
    }
    .ghud-emoji {
      font-size: 22px; /* Larger emoji */
    }

    /* ── Cooldown Overlays ───────────────── */
    .ghud-cd-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .ghud-cd-bg {
      fill: none;
      stroke: transparent;
    }
    .ghud-cd-fg {
      fill: none;
      stroke-width: 4;
      stroke-linecap: butt;
      transition: stroke-dashoffset 0.1s linear;
    }
    .ghud-cd-fg.cryo {
      stroke: rgba(0, 188, 212, 0.4);
    }
    .ghud-cd-fg.pyro {
      stroke: rgba(255, 51, 51, 0.4);
    }

    .ghud-cd-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px; /* Slightly larger countdown text */
      font-weight: 900;
      color: #000;
      -webkit-text-stroke: 0.5px #fff;
      text-shadow: 1px 1px 0px #fff;
    }

    /* ── Key Badges ──────────────────────── */
    .ghud-btn-key {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid #000;
      background: #ffd54f;
      color: #000;
      font-size: 8px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 1px 1px 0px rgba(0,0,0,0.15);
    }

    /* ── Passive Badges ──────────────────── */
    .ghud-passive-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 900;
      padding: 4px;
      border-radius: 4px;
      border: 1.5px solid #000;
      background: #fff;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
      white-space: nowrap;
    }
    .ghud-passive-badge.cryo {
      border-color: #00bcd4;
    }
    .ghud-passive-badge.pyro {
      border-color: #ff3333;
    }
    
    .ghud-passive-active {
      opacity: 1.0 !important;
      animation: ghud-passive-pulse 0.8s ease-in-out infinite alternate;
    }
    
    @keyframes ghud-passive-pulse {
      from { transform: scale(1.0); }
      to   { transform: scale(1.1); }
    }

    /* ── Retro Tooltip Cards ─────────────── */
    .ghud-tooltip {
      position: absolute;
      bottom: 54px; /* Float directly above the action button */
      left: 50%;
      transform: translateX(-50%);
      width: 220px;
      padding: 10px;
      border: 2px solid #000;
      background: #fff;
      box-shadow: 4px 4px 0px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      gap: 4px;
      z-index: 1020;
      white-space: normal;
      pointer-events: none;
      text-align: left;
    }
    
    .ghud-tooltip.cryo {
      border-color: #00bcd4;
    }
    .ghud-tooltip.pyro {
      border-color: #ff3333;
    }

    .ghud-action-btn:hover {
      cursor: help;
    }
    .ghud-action-btn:hover .ghud-tooltip {
      display: flex;
    }

    .ghud-tooltip-name {
      font-size: 12px;
      font-weight: 900;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .ghud-tooltip-cd {
      font-size: 10px;
      font-weight: 800;
      color: #ffd54f;
      -webkit-text-stroke: 0.3px #000;
    }
    .ghud-tooltip.cryo .ghud-tooltip-cd {
      color: #00bcd4;
    }
    .ghud-tooltip.pyro .ghud-tooltip-cd {
      color: #ff3333;
    }
    
    .ghud-tooltip-desc {
      font-size: 10px;
      font-weight: 600;
      color: #555;
      line-height: 1.3;
    }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────

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
    
    // Build sidebars on left and right margins
    this._buildSidebar('cryo', 'left');
    this._buildSidebar('pyro', 'right');
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

  _buildSidebar(element, side) {
    const charData = getCharacter(element === 'cryo' ? 'ayaka' : 'yoimiya');
    const bar = document.createElement('div');
    bar.className = `ghud-sidebar ${side}`;

    // E Skill Button
    const eEmoji = element === 'cryo' ? '❄️' : '🔥';
    const eBtn = this._createActionButton('E', eEmoji, element, charData.skillE);
    bar.appendChild(eBtn);
    this[`_btn_${element}_E_fg`] = eBtn.querySelector('.ghud-cd-fg');
    this[`_btn_${element}_E_text`] = eBtn.querySelector('.ghud-cd-text');

    // Q Burst Button
    const qEmoji = element === 'cryo' ? '🌀' : '🎆';
    const qBtn = this._createActionButton('Q', qEmoji, element, charData.burstQ);
    bar.appendChild(qBtn);
    this[`_btn_${element}_Q_fg`] = qBtn.querySelector('.ghud-cd-fg');
    this[`_btn_${element}_Q_text`] = qBtn.querySelector('.ghud-cd-text');

    // Passive Badge
    const passiveBadge = document.createElement('div');
    passiveBadge.className = `ghud-passive-badge ${element}`;
    passiveBadge.innerHTML = element === 'cryo' ? '⚔️' : '🎯';
    passiveBadge.style.opacity = '0.2'; // Greyed out by default
    bar.appendChild(passiveBadge);
    this[`_badge_${element}`] = passiveBadge;

    this.root.appendChild(bar);
  }

  _createActionButton(key, emoji, element, abilityData) {
    const btn = document.createElement('div');
    btn.className = `ghud-action-btn ${element}`;
    btn.innerHTML = `
      <div class="ghud-action-name">${abilityData.name}</div>
      <div class="ghud-emoji">${emoji}</div>
      <svg viewBox="0 0 32 32" class="ghud-cd-svg">
        <circle cx="16" cy="16" r="13" class="ghud-cd-bg"></circle>
        <circle cx="16" cy="16" r="13" class="ghud-cd-fg ${element}"
                stroke-dasharray="81.68"
                stroke-dashoffset="0"></circle>
      </svg>
      <div class="ghud-cd-text"></div>
      <div class="ghud-btn-key">${key}</div>
      
      <!-- Retro Tooltip Card -->
      <div class="ghud-tooltip ${element}">
        <div class="ghud-tooltip-name">${abilityData.name}</div>
        <div class="ghud-tooltip-cd">Cooldown: ${abilityData.cooldown}s</div>
        <div class="ghud-tooltip-desc">${abilityData.description}</div>
      </div>
    `;
    return btn;
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Update the HP bar for a fighter (silent updates for hidden HUD)
   */
  updateHP(fighter, currentHP, maxHP) {
    const pct = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
    if (this[`_hp_${fighter}_fill`]) this[`_hp_${fighter}_fill`].style.width = `${pct}%`;
    if (this[`_hp_${fighter}_text`]) this[`_hp_${fighter}_text`].textContent = `${Math.round(currentHP)} / ${Math.round(maxHP)}`;
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
   * Update ability cooldown overlays in sidebar
   * @param {'cryo'|'pyro'} fighter
   * @param {'E'|'Q'} key
   * @param {number} remaining
   * @param {number} total
   */
  updateAbilityCD(fighter, key, remaining, total) {
    const fg = this[`_btn_${fighter}_${key}_fg`];
    const txt = this[`_btn_${fighter}_${key}_text`];
    if (!fg || !txt) return;

    if (remaining <= 0) {
      fg.style.strokeDashoffset = '0';
      txt.textContent = '';
    } else {
      const frac = remaining / total;
      // 81.68 is the full stroke dash array size. Sweep clockwise by subtracting remaining Cd
      fg.style.strokeDashoffset = String(81.68 * frac);
      txt.textContent = remaining.toFixed(1);
    }
  }

  /**
   * Update passive status in sidebar
   * @param {'cryo'|'pyro'} fighter
   * @param {number} duration - timer duration left (for Ayaka)
   * @param {number} stacks - passive stacks (Yoimiya only)
   */
  updatePassiveState(fighter, duration, stacks) {
    const badge = this[`_badge_${fighter}`];
    if (!badge) return;

    if (fighter === 'cryo') {
      if (duration > 0) {
        badge.classList.add('ghud-passive-active');
        badge.textContent = `⚔️ ${(duration / 1000).toFixed(1)}s`;
      } else {
        badge.classList.remove('ghud-passive-active');
        badge.textContent = '⚔️ Off';
      }
    } else if (fighter === 'pyro') {
      if (stacks > 0) {
        badge.classList.add('ghud-passive-active');
        badge.textContent = `🎯 x${stacks}`;
      } else {
        badge.classList.remove('ghud-passive-active');
        badge.textContent = '🎯 x0';
      }
    }
  }

  /** Remove the HUD from the DOM. */
  destroy() {
    this.root.remove();
  }
}
