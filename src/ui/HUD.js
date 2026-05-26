// ─────────────────────────────────────────────────────────────
// HUD.js – DOM-based heads-up display overlay for Gacha Circles
// Glassmorphism panels, health bars, stats, skill cooldowns.
// ─────────────────────────────────────────────────────────────

import { getCharacter } from '../characters/CharacterData.js';

const CRYO_COLOR = '#5ed4fc';
const CRYO_GRADIENT = 'linear-gradient(90deg, #5ed4fc, #1a6dd4)';
const PYRO_COLOR = '#ff8c32';
const PYRO_GRADIENT = 'linear-gradient(90deg, #d42020, #ff8c32)';
const ELECTRO_COLOR = '#c77dff';
const ELECTRO_GRADIENT = 'linear-gradient(90deg, #7b2d8b, #c77dff)';

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
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 32px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.5px;
    }
    .ghud-name-cryo {
      color: #00bcd4;
      text-shadow: 1px 1px 0px #000, 2px 2px 0px rgba(0,0,0,0.15), 0 0 10px rgba(0, 188, 212, 0.4);
    }
    .ghud-name-pyro {
      color: #ff3333;
      text-shadow: 1px 1px 0px #000, 2px 2px 0px rgba(0,0,0,0.15), 0 0 10px rgba(255, 51, 51, 0.4);
    }
    .ghud-name-electro {
      color: #c77dff;
      text-shadow: 1px 1px 0px #000, 2px 2px 0px rgba(0,0,0,0.15), 0 0 10px rgba(199, 125, 255, 0.45);
    }
    .ghud-vs {
      color: #000;
      font-size: 20px;
      font-weight: 900;
    }

    /* ── Health Bars ─────────────────────── */
    .ghud-hp-wrap {
      position: absolute;
      top: 56px;
      width: 220px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ghud-hp-wrap.left { left: 20px; }
    .ghud-hp-wrap.right { right: 20px; }

    .ghud-hp-text {
      font-size: 17px;
      font-weight: 900;
      color: #000;
      margin-top: 4px;
    }
    .ghud-hp-wrap.left .ghud-hp-text {
      text-align: right;
      padding-right: 4px;
    }
    .ghud-hp-wrap.right .ghud-hp-text {
      text-align: left;
      padding-left: 4px;
    }

    .ghud-hp-bar-bg {
      width: 100%;
      height: 12px;
      background: #fff;
      border: 2px solid #000;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      overflow: hidden;
      position: relative;
    }
    .ghud-hp-bar-ghost {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: #ffd54f;
      transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1;
    }
    .ghud-hp-bar-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      transition: width 0.2s ease;
      z-index: 2;
    }
    .ghud-hp-bar-fill.cryo { background: #00bcd4; }
    .ghud-hp-bar-fill.pyro { background: #ff3333; }
    .ghud-hp-bar-fill.electro { background: linear-gradient(90deg, #7b2d8b, #c77dff); }

    /* ── Sidebars ────────────────────────── */
    .ghud-sidebar {
      position: absolute;
      bottom: 10px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 14px;
      z-index: 1005;
    }
    .ghud-sidebar.left { left: 60px; }
    .ghud-sidebar.right {
      right: 60px;
      flex-direction: row-reverse;
    }

    /* ── Action Buttons ──────────────────── */
    .ghud-action-btn {
      position: relative;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 2px solid #000;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      pointer-events: auto;
    }
    .ghud-emoji {
      font-size: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ghud-icon-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    /* ── Cooldown Overlays ───────────────── */
    .ghud-cd-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .ghud-cd-bg { fill: none; stroke: transparent; }
    .ghud-cd-fg {
      fill: none;
      stroke-width: 4;
      stroke-linecap: butt;
      transition: stroke-dashoffset 0.1s linear;
    }
    .ghud-cd-fg.cryo { stroke: rgba(0, 188, 212, 0.4); }
    .ghud-cd-fg.pyro { stroke: rgba(255, 51, 51, 0.4); }
    .ghud-cd-fg.electro { stroke: #c77dff; }

    .ghud-cd-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
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
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid #000;
      background: #ffd54f;
      color: #000;
      font-size: 9px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 1px 1px 0px rgba(0,0,0,0.15);
    }

    /* ── Tooltips ───────────────────────── */
    .ghud-tooltip {
      position: absolute;
      bottom: 64px;
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
    .ghud-tooltip.cryo { border-color: #00bcd4; }
    .ghud-tooltip.pyro { border-color: #ff3333; }
    .ghud-tooltip.electro { border-color: #c77dff; }

    .ghud-action-btn:hover .ghud-tooltip { display: flex; }

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
    .ghud-tooltip-desc {
      font-size: 10px;
      font-weight: 600;
      color: #555;
      line-height: 1.3;
    }

    /* ── Score Tracker ───────────────────── */
    .ghud-score-tracker {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 20px;
      background: #fffbf0;
      padding: 6px 16px;
      border: 2px solid #000;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.15);
      z-index: 1010;
    }
    .ghud-score-val {
      font-size: 32px;
      font-weight: 950;
      color: #000;
      text-shadow: 4px 4px 0px rgba(0,0,0,0.15);
    }
    .ghud-score-val.cryo { color: #00bcd4; }
    .ghud-score-val.pyro { color: #ff3333; }
    .ghud-score-val.electro { color: #c77dff; }

    .ghud-score-label {
      font-size: 14px;
      font-weight: 850;
      letter-spacing: 0.5px;
      color: #000;
      text-align: center;
      line-height: 1.1;
    }
  `;
  document.head.appendChild(style);
}

export class HUD {
  constructor(fighter1, fighter2) {
    injectFont();
    injectStyles();

    this.fighter1 = fighter1;
    this.fighter2 = fighter2;

    this.root = document.createElement('div');
    this.root.id = 'gacha-hud';
    const container = document.getElementById('game-container') || document.body;
    container.appendChild(this.root);

    this._buildBanner();
    this._buildHP('left', fighter1);
    this._buildHP('right', fighter2);
    this._buildSidebar('left', fighter1);
    this._buildSidebar('right', fighter2);
    this._buildScoreTracker();
    this._buildVolumePlacard(container);
  }

  _buildVolumePlacard(parent) {
    const d = document.createElement('div');
    d.className = 'ghud-volume-placard';
    d.innerHTML = `<span class="ghud-volume-icon">🔊</span><span>Volume Up!</span>`;
    parent.appendChild(d);
  }

  _buildScoreTracker() {
    const d = document.createElement('div');
    d.className = 'ghud-score-tracker';
    d.innerHTML = `
      <div class="ghud-score-val ${this.fighter1.element}" id="ghud-score-1">0</div>
      <div class="ghud-score-label">best of<br>three</div>
      <div class="ghud-score-val ${this.fighter2.element}" id="ghud-score-2">0</div>
    `;
    this.root.appendChild(d);
    this._score_tracker = d;
    this._score_1 = d.querySelector('#ghud-score-1');
    this._score_2 = d.querySelector('#ghud-score-2');
  }

  _buildBanner() {
    const d = document.createElement('div');
    d.className = 'ghud-banner';
    const name1 = this.fighter1.behavior.hudConfig.nameLabel || this.fighter1.data.name;
    const class1 = this.fighter1.behavior.hudConfig.nameClass || `ghud-name-${this.fighter1.element}`;
    const name2 = this.fighter2.behavior.hudConfig.nameLabel || this.fighter2.data.name;
    const class2 = this.fighter2.behavior.hudConfig.nameClass || `ghud-name-${this.fighter2.element}`;
    d.innerHTML = `<span class="${class1}">${name1}</span><span class="ghud-vs">VS</span><span class="${class2}">${name2}</span>`;
    this.root.appendChild(d);
  }

  _buildHP(side, fighter) {
    const wrap = document.createElement('div');
    wrap.className = `ghud-hp-wrap ${side}`;
    const barBg = document.createElement('div');
    barBg.className = 'ghud-hp-bar-bg';
    const ghost = document.createElement('div');
    ghost.className = 'ghud-hp-bar-ghost';
    ghost.style.width = '100%';
    const fill = document.createElement('div');
    fill.className = `ghud-hp-bar-fill ${fighter.element} ${fighter.behavior.hudConfig.barClass || ''}`;
    fill.style.width = '100%';
    barBg.appendChild(ghost);
    barBg.appendChild(fill);
    const hpSpan = document.createElement('div');
    hpSpan.className = 'ghud-hp-text';
    hpSpan.textContent = `${Math.round(fighter.hp)} / ${Math.round(fighter.maxHp)}`;
    wrap.appendChild(barBg);
    wrap.appendChild(hpSpan);
    this.root.appendChild(wrap);
    this[`_hp_${side}_fill`] = fill;
    this[`_hp_${side}_ghost`] = ghost;
    this[`_hp_${side}_text`] = hpSpan;
  }

  _buildSidebar(side, fighter) {
    const bar = document.createElement('div');
    bar.className = `ghud-sidebar ${side}`;
    const eEmoji = fighter.data.skillE.emoji || '✨';
    const eBtn = this._createActionButton('E', eEmoji, fighter.element, fighter.data.skillE, fighter.behavior.hudConfig.barClass);
    const qEmoji = fighter.data.burstQ.emoji || '💫';
    const qBtn = this._createActionButton('Q', qEmoji, fighter.element, fighter.data.burstQ, fighter.behavior.hudConfig.barClass);
    bar.appendChild(eBtn);
    bar.appendChild(qBtn);
    this.root.appendChild(bar);
    this[`_btn_${side}_E_fg`] = eBtn.querySelector('.ghud-cd-fg');
    this[`_btn_${side}_E_text`] = eBtn.querySelector('.ghud-cd-text');
    this[`_btn_${side}_Q_fg`] = qBtn.querySelector('.ghud-cd-fg');
    this[`_btn_${side}_Q_text`] = qBtn.querySelector('.ghud-cd-text');
  }

  _createActionButton(key, emoji, element, abilityData, customClass = '') {
    const btn = document.createElement('div');
    btn.className = `ghud-action-btn ${element} ${customClass}`;
    const iconContent = abilityData.icon ? `<img src="${abilityData.icon}" class="ghud-icon-img" alt="${abilityData.name}">` : emoji;
    btn.innerHTML = `
      <div class="ghud-emoji">${iconContent}</div>
      <svg viewBox="0 0 32 32" class="ghud-cd-svg">
        <circle cx="16" cy="16" r="13" class="ghud-cd-bg"></circle>
        <circle cx="16" cy="16" r="13" class="ghud-cd-fg ${element} ${customClass}" stroke-dasharray="81.68" stroke-dashoffset="0"></circle>
      </svg>
      <div class="ghud-cd-text"></div>
      <div class="ghud-btn-key">${key}</div>
      <div class="ghud-tooltip ${element} ${customClass}">
        <div class="ghud-tooltip-name">${abilityData.name}</div>
        <div class="ghud-tooltip-cd">Cooldown: ${abilityData.cooldown}s</div>
        <div class="ghud-tooltip-desc">${abilityData.description}</div>
      </div>
    `;
    return btn;
  }

  updateHP(side, currentHP, maxHP) {
    const pct = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
    const fill = this[`_hp_${side}_fill`];
    const ghost = this[`_hp_${side}_ghost`];
    const text = this[`_hp_${side}_text`];
    if (fill) fill.style.width = `${pct}%`;
    if (ghost) ghost.style.width = `${pct}%`;
    if (text) text.textContent = `${Math.round(currentHP)} / ${Math.round(maxHP)}`;
  }

  updateStats(side, damage, attackSpeed) {
    // Legacy support or new stats layout
  }

  updateAbilityCD(side, key, remaining, total) {
    const fg = this[`_btn_${side}_${key}_fg`];
    const txt = this[`_btn_${side}_${key}_text`];
    if (!fg || !txt) return;
    if (remaining <= 0) {
      fg.style.strokeDashoffset = '0';
      txt.textContent = '';
    } else {
      const frac = remaining / total;
      fg.style.strokeDashoffset = String(81.68 * frac);
      txt.textContent = remaining.toFixed(1);
    }
  }

  updatePassiveState() {}

  updateScore(score1, score2) {
    if (this._score_1) this._score_1.textContent = String(score1);
    if (this._score_2) this._score_2.textContent = String(score2);
  }

  setScoreVisibility(visible) {
    if (this._score_tracker) this._score_tracker.style.display = visible ? 'flex' : 'none';
  }

  hideReplayDeck() {
    if (this._replayDeck) { this._replayDeck.remove(); this._replayDeck = null; }
    const playbackContainer = document.getElementById('dev-replay-playback-container');
    if (playbackContainer) playbackContainer.innerHTML = `<div class="greplay-placeholder">No active playback. Complete a battle or import a replay to watch.</div>`;
  }

  showWatchReplayButton(gameLoop) {
    const container = document.getElementById('dev-replay-playback-container');
    if (!container) return;
    container.innerHTML = `
      <div class="greplay-watch-action-container">
        <div class="greplay-placeholder" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0; border-style: none; padding: 6px 0;">Match recorded!</div>
        <button class="greplay-btn greplay-btn--watch-action animate-pulse" id="greplay-watch-btn">🎥 WATCH REPLAY</button>
      </div>
    `;
    const btn = container.querySelector('#greplay-watch-btn');
    if (btn) btn.addEventListener('click', () => gameLoop.startReplay());
  }

  updateReplayScrubber(frameIndex, totalFrames, elapsedTime) {
    const scrubber = document.getElementById('greplay-scrubber');
    if (scrubber) { scrubber.max = String(totalFrames - 1); scrubber.value = String(frameIndex); }
    const timeDisplay = document.getElementById('greplay-time-display');
    if (timeDisplay) {
      const totalSeconds = (totalFrames * 0.01667).toFixed(1);
      timeDisplay.textContent = `${elapsedTime.toFixed(1)}s / ${totalSeconds}s`;
    }
  }

  setReplayPlaying(playing) {
    const playBtn = document.getElementById('greplay-play-btn');
    if (playBtn) playBtn.textContent = playing ? '⏸️' : '▶️';
  }

  updateSkillCDProgress(side, progress) {
    // Replay support logic
    const fg = this[`_btn_${side}_E_fg`];
    const txt = this[`_btn_${side}_E_text`];
    if (!fg || !txt) return;
    if (progress >= 1.0) { fg.style.strokeDashoffset = '0'; txt.textContent = ''; }
    else {
      const frac = 1.0 - progress;
      fg.style.strokeDashoffset = String(81.68 * frac);
      const remaining = frac * 10.0; // approximation
      txt.textContent = remaining > 0 ? remaining.toFixed(1) : '';
    }
  }

  updateBurstCDProgress(side, progress) {
    // Replay support logic
    const fg = this[`_btn_${side}_Q_fg`];
    const txt = this[`_btn_${side}_Q_text`];
    if (!fg || !txt) return;
    if (progress >= 1.0) { fg.style.strokeDashoffset = '0'; txt.textContent = ''; }
    else {
      const frac = 1.0 - progress;
      fg.style.strokeDashoffset = String(81.68 * frac);
      const remaining = frac * 20.0; // approximation
      txt.textContent = remaining > 0 ? remaining.toFixed(1) : '';
    }
  }

  destroy() { this.root.remove(); }
}
