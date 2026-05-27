/**
 * main.js — Gacha Circles entry point
 * Initializes PixiJS, creates fighters, wires up VFX and UI, starts the game loop.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { getCharacterRegistry } from './characters/CharacterRegistry.js';
import { Fighter } from './characters/Fighter.js';
import { GameLoop } from './gameLoop.js';
import { randomVelocity } from './physics.js';
import { playSFX } from './utils/audio.js';
import { HUD } from './ui/HUD.js';
import { DamageNumbers } from './ui/DamageNumbers.js';
import { DevUI } from './ui/DevUI.js';
import './style.css';

// Game constants
const GAME_WIDTH = 600;
const GAME_HEIGHT = 670;
const ARENA_PADDING_TOP = 110;
const ARENA_PADDING_BOTTOM = 80;

// Arena bounds (perfect 1:1 square, centered horizontally)
const ARENA_SIZE = 480;
const ARENA = {
  x: (GAME_WIDTH - ARENA_SIZE) / 2,
  y: ARENA_PADDING_TOP,
  width: ARENA_SIZE,
  height: ARENA_SIZE,
};

let app;
let gameLoop;
let fighter1, fighter2;

async function init() {
  // Create PixiJS application
  const savedBG = localStorage.getItem('dev-bg-color') || '#a8f5b4';
  app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: savedBG,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Add canvas to DOM
  const canvasWrapper = document.getElementById('game-canvas-wrapper');
  if (canvasWrapper) {
    canvasWrapper.innerHTML = ''; // Clear previous canvas elements on hot reload
  }
  canvasWrapper.appendChild(app.canvas);

  // Draw arena background
  createArenaBackground();

  // Create fighters
  const f1Id = localStorage.getItem('dev-fighter1-id') || 'ayaka';
  const f2Id = localStorage.getItem('dev-fighter2-id') || 'yoimiya';

  const fighter1Reg = getCharacterRegistry(f1Id);
  const fighter2Reg = getCharacterRegistry(f2Id);

  const f1Data = fighter1Reg.data;
  const f2Data = fighter2Reg.data;

  // Override HP from dev storage if present
  const devHP = localStorage.getItem('dev-hp-config');
  if (devHP) {
    const hp = parseInt(devHP, 10);
    f1Data.hp = hp;
    f2Data.hp = hp;
  }

  // Override Damage from dev storage if present
  const devDmgMult = localStorage.getItem('dev-dmg-multiplier');
  if (devDmgMult) {
    const mult = parseFloat(devDmgMult);
    if (!isNaN(mult)) {
      f1Data.damage *= mult;
      f2Data.damage *= mult;
    }
  }

  const vel1 = randomVelocity(f1Data.speed);
  const vel2 = randomVelocity(f2Data.speed);

  fighter1 = new Fighter(f1Data, GAME_WIDTH * 0.25, GAME_HEIGHT * 0.5, vel1);
  fighter2 = new Fighter(f2Data, GAME_WIDTH * 0.75, GAME_HEIGHT * 0.5, vel2);

  // Apply instant cast if enabled in dev panel
  if (localStorage.getItem('dev-instant-cast') === 'true') {
    fighter1.skillCDTimer = 0;
    fighter1.burstCDTimer = 0;
    fighter2.skillCDTimer = 0;
    fighter2.burstCDTimer = 0;
  }

  // Assign behaviors (CharacterBehavior interface)
  fighter1.behavior = fighter1Reg.behavior;
  fighter2.behavior = fighter2Reg.behavior;

  // Create VFX via behavior factory
  const vfx1 = fighter1.behavior.createVFX();
  const vfx2 = fighter2.behavior.createVFX();

  // Assign VFX to fighters
  fighter1.vfx = vfx1;
  fighter2.vfx = vfx2;

  // Create visuals
  await fighter1.createVisuals();
  await fighter2.createVisuals();

  // Add fighters to stage (under VFX)
  app.stage.addChild(fighter1.container);
  app.stage.addChild(fighter2.container);

  // Add VFX containers to stage
  app.stage.addChild(vfx1.container);
  app.stage.addChild(vfx2.container);

  // Set up UI
  const hud = new HUD(fighter1, fighter2);
  const damageNumbers = new DamageNumbers();

  // Set initial stats on HUD
  hud.updateStats('left', f1Data.damage, f1Data.attackSpeed);
  hud.updateStats('right', f2Data.damage, f2Data.attackSpeed);
  hud.updateHP('left', f1Data.hp, f1Data.hp);
  hud.updateHP('right', f2Data.hp, f2Data.hp);

  // Initialize and display scores
  const score1 = parseInt(localStorage.getItem('match-score-cryo') || '0', 10);
  const score2 = parseInt(localStorage.getItem('match-score-pyro') || '0', 10);
  hud.updateScore(score1, score2);

  // Create game loop
  gameLoop = new GameLoop(fighter1, fighter2, ARENA, hud, damageNumbers, app.stage);

  // Initialize Developer UI
  new DevUI(gameLoop);

  // ── Keyboard Controls ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gameLoop && !gameLoop.gameOver) {
      e.preventDefault();
      gameLoop.togglePause();
    }
  });

  // Handle game over
  gameLoop.onGameOver = (winner) => {
    showWinScreen(winner);
  };

  // Start the game loop
  app.ticker.add((ticker) => {
    gameLoop.update(ticker.deltaTime);

    // Update VFX skill animations
    vfx1.updateSkill(ticker.deltaTime, fighter1.body.x, fighter1.body.y);
    vfx2.updateSkill(ticker.deltaTime, fighter2.body.x, fighter2.body.y);
  });

  // Wire up Dev Panel controls
  const devRestartBtn = document.getElementById('dev-btn-restart');
  const devRematchBtn = document.getElementById('dev-btn-rematch');
  if (devRestartBtn) {
    devRestartBtn.addEventListener('click', () => {
      location.reload();
    });
  }
  if (devRematchBtn) {
    devRematchBtn.addEventListener('click', () => {
      if (!devRematchBtn.disabled) {
        location.reload();
      }
    });
  }

  console.log(`🎮 Gacha Circles initialized! ${f1Data.name} vs ${f2Data.name} — FIGHT!`);
}

/**
 * Draw the arena background with subtle grid and border
 */
function createArenaBackground() {
  const bg = new Graphics();

  // Arena floor — clean light mint/pastel green or custom dev color
  const arenaHex = localStorage.getItem('dev-arena-color') || '#e2fde6';
  bg.rect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
  bg.fill({ color: arenaHex });

  // Arena border — crisp solid black
  bg.rect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
  bg.stroke({ color: 0x000000, width: 3 });

  app.stage.addChild(bg);
}

/**
 * Show the win screen overlay
 */
function showWinScreen(winner) {
  const overlay = document.createElement('div');
  overlay.className = 'win-screen';
  overlay.id = 'win-screen';

  // Create image panel
  const imgPanel = document.createElement('div');
  imgPanel.className = 'win-screen__panel win-screen__panel--image';

  const splashImg = document.createElement('img');
  splashImg.className = 'win-screen__splash-img';
  // Use character-specific splash if defined, otherwise use elemental fallback
  const splashPath = winner.data.splash || (winner.element === 'cryo' ? '/characters/ayaka-splash.png' : '/characters/yoimiya-splash.png');
  splashImg.src = splashPath;
  splashImg.alt = `${winner.data.name} Splash`;

  // Fallback if splash image is not present
  splashImg.onerror = () => {
    splashImg.src = winner.data.portrait || (winner.element === 'cryo' ? '/characters/ayaka_portrait.png' : '/characters/yoimiya_portrait.png');
    splashImg.style.objectFit = 'contain';
    splashImg.style.padding = '40px';
  };
  imgPanel.appendChild(splashImg);

  // Create text panel
  const textPanel = document.createElement('div');
  textPanel.className = 'win-screen__panel win-screen__panel--text';

  const placard = document.createElement('div');
  placard.className = 'win-screen__placard';
  placard.textContent = 'WINNER';

  const displayName = winner.data.name === 'Kamisato Ayaka' ? 'Ayaka' : winner.data.name;

  const title = document.createElement('div');
  title.className = `win-screen__title hud-banner__name--${winner.element}`;
  title.textContent = displayName.toUpperCase();

  const subtitle = document.createElement('div');
  subtitle.className = 'win-screen__subtitle';
  subtitle.innerHTML = `${winner.data.title}<br><span style="font-size: 13px; font-weight: 700; margin-top: 6px; display: inline-block; text-transform: uppercase;">${winner.hp}/${winner.maxHp} HP remaining</span>`;

  // ── Statistics Section ───────────────────────
  const statsContainer = document.createElement('div');
  statsContainer.className = 'win-screen__stats';

  const s = winner.stats;
  const normalDmg = Math.round(s.damageDealt.normal || 0);
  const enhancedDmg = Math.round(s.damageDealt.enhancedNormal || 0);
  const skillDmg = Math.round(s.damageDealt.skill || 0);
  const burstDmg = Math.round(s.damageDealt.burst || 0);
  const totalDmg = normalDmg + enhancedDmg + skillDmg + burstDmg;

  // Calculate percentages
  const normalPct = totalDmg > 0 ? (normalDmg / totalDmg) * 100 : 0;
  const enhancedPct = totalDmg > 0 ? (enhancedDmg / totalDmg) * 100 : 0;
  const skillPct = totalDmg > 0 ? (skillDmg / totalDmg) * 100 : 0;
  const burstPct = totalDmg > 0 ? (burstDmg / totalDmg) * 100 : 0;

  // Segment colors based on element
  const elementColors = {
    cryo: { enhanced: '#00e5ff', skill: '#00838f', burst: '#ffd600' },
    pyro: { enhanced: '#ff3d00', skill: '#ff9100', burst: '#ffea00' },
    electro: { enhanced: '#e040fb', skill: '#7b2d8b', burst: '#f48dff' }
  };
  const eColors = elementColors[winner.element] || elementColors.cryo;

  const cNormal = '#78909c'; // Cool slate grey
  const cEnhanced = eColors.enhanced;
  const cSkill = eColors.skill;
  const cBurst = eColors.burst;

  // Build the breakdown bar html segments
  let barHtml = '';
  if (totalDmg === 0) {
    barHtml = `<div class="win-stat-bar-segment" style="width: 100%; background: ${cNormal};"></div>`;
  } else {
    if (normalPct > 0) barHtml += `<div class="win-stat-bar-segment" style="width: ${normalPct}%; background: ${cNormal};" title="Normal: ${normalDmg}"></div>`;
    if (enhancedPct > 0) barHtml += `<div class="win-stat-bar-segment" style="width: ${enhancedPct}%; background: ${cEnhanced};" title="Enhanced Normal: ${enhancedDmg}"></div>`;
    if (skillPct > 0) barHtml += `<div class="win-stat-bar-segment" style="width: ${skillPct}%; background: ${cSkill};" title="Skill: ${skillDmg}"></div>`;
    if (burstPct > 0) barHtml += `<div class="win-stat-bar-segment" style="width: ${burstPct}%; background: ${cBurst};" title="Ultimate: ${burstDmg}"></div>`;
  }

  // Calculate Time Elapsed and Average DPS
  const elapsedTime = gameLoop ? gameLoop.elapsedTime : 0;
  const timeStr = elapsedTime.toFixed(1) + 's';
  const averageDPS = elapsedTime > 0 ? Math.round(totalDmg / elapsedTime) : 0;

  // Calculate difficulty outcome depending on winner's remaining HP (out of 500 max HP)
  const remainingHP = winner.hp;
  const maxHP = winner.maxHp || 500;
  const hpPct = (remainingHP / maxHP) * 100;
  
  let diffLabel = '';
  let diffColor = '#2e7d32'; // Saturated green
  let diffClass = '';

  if (remainingHP > 150) {
    diffLabel = 'LOW DIFF';
    diffColor = '#2e7d32';
  } else if (hpPct > 20) {
    diffLabel = 'MID DIFF';
    diffColor = '#ff9800'; // Orange
  } else if (hpPct > 8) {
    diffLabel = 'HIGH DIFF';
    diffColor = '#d32f2f'; // Red
  } else {
    diffLabel = 'EXTREME DIFF';
    diffColor = '#880e4f'; // Dark crimson
    diffClass = 'diff-clutch';
  }

  statsContainer.innerHTML = `
    <div class="win-stat-row">
      <span class="win-stat-label">Total Damage Done:</span>
      <span class="win-stat-value">${totalDmg}</span>
    </div>
    
    <div class="win-stat-bar-wrapper">
      ${barHtml}
    </div>

    <div class="win-stat-legend-container">
      <div class="win-stat-legend-item">
        <span class="win-stat-legend-dot" style="background: ${cNormal}"></span>
        <span class="win-stat-legend-label">Normal</span>
        <span class="win-stat-legend-val">${normalDmg} <span class="win-stat-legend-pct">(${Math.round(normalPct)}%)</span></span>
      </div>
      <div class="win-stat-legend-item">
        <span class="win-stat-legend-dot" style="background: ${cEnhanced}"></span>
        <span class="win-stat-legend-label">Enhanced</span>
        <span class="win-stat-legend-val">${enhancedDmg} <span class="win-stat-legend-pct">(${Math.round(enhancedPct)}%)</span></span>
      </div>
      <div class="win-stat-legend-item">
        <span class="win-stat-legend-dot" style="background: ${cSkill}"></span>
        <span class="win-stat-legend-label">Skill (E)</span>
        <span class="win-stat-legend-val">${skillDmg} <span class="win-stat-legend-pct">(${Math.round(skillPct)}%)</span></span>
      </div>
      <div class="win-stat-legend-item">
        <span class="win-stat-legend-dot" style="background: ${cBurst}"></span>
        <span class="win-stat-legend-label">Ultimate</span>
        <span class="win-stat-legend-val">${burstDmg} <span class="win-stat-legend-pct">(${Math.round(burstPct)}%)</span></span>
      </div>
    </div>

    <div class="win-stat-divider" style="margin-top: 16px;"></div>

    <div class="win-stat-row">
      <span class="win-stat-label">Time Elapsed:</span>
      <span class="win-stat-value">${timeStr}</span>
    </div>
    <div class="win-stat-row">
      <span class="win-stat-label">Average DPS:</span>
      <span class="win-stat-value">${averageDPS}</span>
    </div>
    <div class="win-stat-row">
      <span class="win-stat-label">Skill Casts:</span>
      <span class="win-stat-value">${s.casts.skill}</span>
    </div>
    <div class="win-stat-row">
      <span class="win-stat-label">Ultimate Casts:</span>
      <span class="win-stat-value">${s.casts.burst}</span>
    </div>

    <div class="win-stat-divider" style="margin-top: 8px; margin-bottom: 8px;"></div>

    <div class="win-stat-row" style="justify-content: center;">
      <span class="win-stat-value win-stat-value--diff-badge ${diffClass}" style="background: ${diffColor};">
        ${diffLabel}
      </span>
    </div>
  `;

  textPanel.appendChild(placard);
  textPanel.appendChild(title);
  textPanel.appendChild(subtitle);
  textPanel.appendChild(statsContainer);

  // Layout logic: Always align splash to the side the fighter was on
  // Use global fighter1/fighter2 references or fallback to gameLoop references
  const f1 = fighter1 || (gameLoop ? gameLoop.fighter1 : null);
  const isLeftWinner = (winner === f1);

  if (isLeftWinner) {
    imgPanel.classList.add('win-screen__panel--left');
    textPanel.classList.add('win-screen__panel--right');
    overlay.appendChild(imgPanel);
    overlay.appendChild(textPanel);
  } else {
    textPanel.classList.add('win-screen__panel--left');
    imgPanel.classList.add('win-screen__panel--right');
    overlay.appendChild(textPanel);
    overlay.appendChild(imgPanel);
  }

  document.getElementById('hud-overlay').appendChild(overlay);

  // Play victory splash audio
  playSFX('/audio/winner-splash.wav');

  // Apply victory styling hooks to the HUD to fade out irrelevant components
  const hudElement = document.getElementById('gacha-hud');
  if (hudElement) {
    hudElement.classList.add('hud-active-win');
    hudElement.classList.add(`hud-winner-${winner.element}`);
    // Hide the losing side's name/hp/sidebar based on winner side
    if (isLeftWinner) {
      hudElement.classList.add('hud-winner-side-left');
    } else {
      hudElement.classList.add('hud-winner-side-right');
    }
  }

  // Enable the Dev Panel rematch button
  const devRematchBtn = document.getElementById('dev-btn-rematch');
  if (devRematchBtn) {
    devRematchBtn.removeAttribute('disabled');
  }

  // ── Update Match Scores ─────────────────────
  const scoreKey = winner.element === 'cryo' ? 'match-score-cryo' : 'match-score-pyro';
  const currentScore = parseInt(localStorage.getItem(scoreKey) || '0', 10);
  const newScore = currentScore + 1;
  localStorage.setItem(scoreKey, newScore);

  // Sync HUD scores instantly
  const cryoFinal = winner.element === 'cryo' ? newScore : parseInt(localStorage.getItem('match-score-cryo') || '0', 10);
  const pyroFinal = winner.element === 'pyro' ? newScore : parseInt(localStorage.getItem('match-score-pyro') || '0', 10);
  
  const hudInstance = gameLoop ? gameLoop.hud : null;
  if (hudInstance) {
    hudInstance.updateScore(cryoFinal, pyroFinal);
  }

  // ── Auto-Rematch Logic ─────────────────────
  if (localStorage.getItem('dev-auto-rematch') === 'true') {
    const autoRematchMsg = document.createElement('div');
    autoRematchMsg.style.marginTop = '20px';
    autoRematchMsg.style.fontSize = '14px';
    autoRematchMsg.style.fontWeight = '800';
    autoRematchMsg.style.color = '#ffd54f';
    autoRematchMsg.style.textAlign = 'center';
    autoRematchMsg.style.textTransform = 'uppercase';
    autoRematchMsg.style.letterSpacing = '1px';
    autoRematchMsg.textContent = 'Auto-rematch in 5s...';
    statsContainer.appendChild(autoRematchMsg);

    let timeLeft = 5;
    const interval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        autoRematchMsg.textContent = `Auto-rematch in ${timeLeft}s...`;
      } else {
        clearInterval(interval);
        location.reload();
      }
    }, 1000);
  }
}

// Remove default Vite template content
const existingApp = document.getElementById('app');
if (existingApp) existingApp.remove();

// Start the game
init().catch(console.error);

// Clean up PixiJS application on hot reload to prevent duplicate loops and double audio triggers
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (app) {
      try {
        app.destroy(true, { children: true, texture: true, baseTexture: true });
        console.log('♻️ PixiJS application destroyed for hot reload.');
      } catch (e) {
        console.warn('Failed to destroy PixiJS app on HMR:', e);
      }
    }
  });
}
