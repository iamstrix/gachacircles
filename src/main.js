/**
 * main.js — Gacha Circles entry point
 * Initializes PixiJS, creates fighters, wires up VFX and UI, starts the game loop.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { getCharacter } from './characters/CharacterData.js';
import { Fighter } from './characters/Fighter.js';
import { GameLoop } from './gameLoop.js';
import { randomVelocity } from './physics.js';
import { CryoVFX } from './vfx/CryoVFX.js';
import { PyroVFX } from './vfx/PyroVFX.js';
import { HUD } from './ui/HUD.js';
import { DamageNumbers } from './ui/DamageNumbers.js';
import './style.css';

// Game constants
const GAME_WIDTH = 450;
const GAME_HEIGHT = 800;
const ARENA_PADDING_TOP = 55;
const ARENA_PADDING_BOTTOM = 50;

// Arena bounds (slightly inset to avoid HUD overlap)
const ARENA = {
  x: 10,
  y: ARENA_PADDING_TOP,
  width: GAME_WIDTH - 20,
  height: GAME_HEIGHT - ARENA_PADDING_TOP - ARENA_PADDING_BOTTOM,
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
  gameLoop = new GameLoop(fighter1, fighter2, ARENA, hud, damageNumbers);

  // Handle game over
  gameLoop.onGameOver = (winner) => {
    showWinScreen(winner);
  };

  // Start the game loop
  app.ticker.add((ticker) => {
    gameLoop.update(ticker.deltaTime);

    // Update VFX skill animations
    cryoVFX.updateSkill(ticker.deltaTime);
    pyroVFX.updateSkill(ticker.deltaTime);
  });

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

  const title = document.createElement('div');
  title.className = `win-screen__title hud-banner__name--${winner.element}`;
  title.textContent = `${winner.data.name} Wins!`;

  const subtitle = document.createElement('div');
  subtitle.className = 'win-screen__subtitle';
  subtitle.textContent = `${winner.data.title} • ${winner.hp}/${winner.maxHp} HP remaining`;

  const restartBtn = document.createElement('button');
  restartBtn.className = 'win-screen__restart';
  restartBtn.textContent = 'Rematch';
  restartBtn.addEventListener('click', () => {
    location.reload();
  });

  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(restartBtn);

  document.getElementById('hud-overlay').appendChild(overlay);
}

// Remove default Vite template content
const existingApp = document.getElementById('app');
if (existingApp) existingApp.remove();

// Start the game
init().catch(console.error);
