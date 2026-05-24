/**
 * main.js — Gacha Circles entry point
 * Initializes PixiJS, creates fighters, wires up VFX and UI, starts the game loop.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { getCharacter } from './characters/CharacterData.js';
import { Fighter } from './characters/Fighter.js';
import { GameLoop } from './gameLoop.js';
import { randomVelocity } from './physics.js';
import { playSFX } from './utils/audio.js';
import { CryoVFX } from './vfx/CryoVFX.js';
import { PyroVFX } from './vfx/PyroVFX.js';
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
  app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: 0xa8f5b4,
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

  // Create VFX systems
  const cryoVFX = new CryoVFX();
  const pyroVFX = new PyroVFX();

  // Add VFX containers to stage (behind fighters)
  app.stage.addChild(cryoVFX.container);
  app.stage.addChild(pyroVFX.container);

  // Create fighters
  const ayakaData = getCharacter('ayaka');
  const yoimiyaData = getCharacter('yoimiya');

  // Override HP from dev storage if present
  const devHP = localStorage.getItem('dev-hp-config');
  if (devHP) {
    const hp = parseInt(devHP, 10);
    ayakaData.hp = hp;
    yoimiyaData.hp = hp;
  }

  // Override Damage from dev storage if present
  const devDmgMult = localStorage.getItem('dev-dmg-multiplier');
  if (devDmgMult) {
    const mult = parseFloat(devDmgMult);
    if (!isNaN(mult)) {
      ayakaData.damage *= mult;
      yoimiyaData.damage *= mult;
    }
  }

  const vel1 = randomVelocity(ayakaData.speed);
  const vel2 = randomVelocity(yoimiyaData.speed);

  fighter1 = new Fighter(ayakaData, GAME_WIDTH * 0.25, GAME_HEIGHT * 0.5, vel1);
  fighter2 = new Fighter(yoimiyaData, GAME_WIDTH * 0.75, GAME_HEIGHT * 0.5, vel2);

  // Assign VFX to fighters
  fighter1.vfx = cryoVFX;
  fighter2.vfx = pyroVFX;

  // Create visuals
  await fighter1.createVisuals();
  await fighter2.createVisuals();

  // Add fighters to stage (on top of VFX)
  app.stage.addChild(fighter1.container);
  app.stage.addChild(fighter2.container);

  // Set up UI
  const hud = new HUD();
  const damageNumbers = new DamageNumbers();

  // Set initial stats on HUD
  hud.updateStats('cryo', ayakaData.damage, ayakaData.attackSpeed);
  hud.updateStats('pyro', yoimiyaData.damage, yoimiyaData.attackSpeed);
  hud.updateHP('cryo', ayakaData.hp, ayakaData.hp);
  hud.updateHP('pyro', yoimiyaData.hp, yoimiyaData.hp);

  // Create game loop
  gameLoop = new GameLoop(fighter1, fighter2, ARENA, hud, damageNumbers, app.stage);

  // Initialize Developer UI
  new DevUI(gameLoop);

  // Handle game over
  gameLoop.onGameOver = (winner) => {
    showWinScreen(winner);
  };

  // Start the game loop
  app.ticker.add((ticker) => {
    gameLoop.update(ticker.deltaTime);

    // Update VFX skill animations (pass Ayaka's position so the ice cyclone tracks her circle center)
    cryoVFX.updateSkill(ticker.deltaTime, fighter1.body.x, fighter1.body.y);
    pyroVFX.updateSkill(ticker.deltaTime);
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

  console.log('🎮 Gacha Circles initialized! Ayaka vs Yoimiya — FIGHT!');
}

/**
 * Draw the arena background with subtle grid and border
 */
function createArenaBackground() {
  const bg = new Graphics();

  // Arena floor — clean light mint/pastel green
  bg.rect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
  bg.fill({ color: 0xe2fde6 });

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
  // Ayaka is 'cryo', Yoimiya is 'pyro'
  const splashPath = winner.element === 'cryo' ? '/characters/ayaka-splash.png' : '/characters/yoimiya-splash.png';
  splashImg.src = splashPath;
  splashImg.alt = `${winner.data.name} Splash`;

  // Fallback if splash image is not present
  splashImg.onerror = () => {
    splashImg.src = winner.element === 'cryo' ? '/characters/ayaka_portrait.png' : '/characters/yoimiya_portrait.png';
    splashImg.style.objectFit = 'contain';
    splashImg.style.padding = '40px';
  };
  imgPanel.appendChild(splashImg);

  // Create text panel
  const textPanel = document.createElement('div');
  textPanel.className = 'win-screen__panel win-screen__panel--text';

  const title = document.createElement('div');
  title.className = `win-screen__title hud-banner__name--${winner.element}`;
  title.textContent = `${winner.data.name} Wins!`;

  const subtitle = document.createElement('div');
  subtitle.className = 'win-screen__subtitle';
  subtitle.textContent = `${winner.data.title} • ${winner.hp}/${winner.maxHp} HP remaining`;

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

  // Segment colors based on element (Cryo Blue vs Pyro Red/Orange)
  const isCryo = winner.element === 'cryo';
  const cNormal = '#78909c'; // Cool slate grey
  const cEnhanced = isCryo ? '#00e5ff' : '#ff3d00'; // Cryo Cyan vs Pyro Red
  const cSkill = isCryo ? '#00838f' : '#ff9100'; // Deep Teal vs Flame Orange
  const cBurst = isCryo ? '#ffd600' : '#ffea00'; // Soumetsu Gold vs Ryuukin Amber

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
  `;

  textPanel.appendChild(title);
  textPanel.appendChild(subtitle);
  textPanel.appendChild(statsContainer);

  // Layout logic: Cryo (Ayaka) is left, Pyro (Yoimiya) is right
  if (winner.element === 'cryo') {
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
    hudElement.classList.add(winner.element === 'cryo' ? 'hud-winner-cryo' : 'hud-winner-pyro');
  }

  // Enable the Dev Panel rematch button
  const devRematchBtn = document.getElementById('dev-btn-rematch');
  if (devRematchBtn) {
    devRematchBtn.removeAttribute('disabled');
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
