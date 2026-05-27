import { setMasterVolume } from '../utils/audio.js';

/**
 * DevUI.js — Developer debug overlay
 * Provides toggles for testing and debugging.
 */
export class DevUI {
  constructor(gameLoop) {
    this.gameLoop = gameLoop;
    this.container = document.getElementById('dev-panel');
    if (!this.container) {
      console.warn('DevUI: #dev-panel not found in DOM.');
      return;
    }
    
    this.createControls();
  }

  createControls() {
    // Add a divider before our new dynamic controls
    const divider = document.createElement('div');
    divider.className = 'dev-divider';
    this.container.appendChild(divider);

    const columnsWrap = document.createElement('div');
    columnsWrap.style.display = 'flex';
    columnsWrap.style.gap = '20px';
    this.container.appendChild(columnsWrap);

    const leftCol = document.createElement('div');
    leftCol.className = 'dev-button-group';
    leftCol.style.flex = '1';
    leftCol.style.marginTop = '0';
    
    const rightCol = document.createElement('div');
    rightCol.className = 'dev-button-group';
    rightCol.style.flex = '1';
    rightCol.style.marginTop = '0';

    columnsWrap.appendChild(leftCol);
    columnsWrap.appendChild(rightCol);

    const f1Name = this.gameLoop.fighter1.data.name;
    const f2Name = this.gameLoop.fighter2.data.name;

    this.addToggle(leftCol, `Invincible: ${f1Name}`, (val) => {
      this.gameLoop.fighter1.isInvincible = val;
    });

    this.addToggle(rightCol, `Invincible: ${f2Name}`, (val) => {
      this.gameLoop.fighter2.isInvincible = val;
    });

    const bo3Visible = localStorage.getItem('dev-bo3-visible') !== 'false';
    this.addToggle(leftCol, 'Show Best of Three UI', (val) => {
      localStorage.setItem('dev-bo3-visible', val);
      if (this.gameLoop.hud) {
        this.gameLoop.hud.setScoreVisibility(val);
      }
    }, bo3Visible);

    const autoRematch = localStorage.getItem('dev-auto-rematch') === 'true';
    this.addToggle(rightCol, 'Auto-Rematch (5s)', (val) => {
      localStorage.setItem('dev-auto-rematch', val);
    }, autoRematch);

    const f1Id = localStorage.getItem('dev-fighter1-id') || 'ayaka';
    this.addTextInput(leftCol, 'Fighter 1 ID', f1Id, 'f1_id');

    const f2Id = localStorage.getItem('dev-fighter2-id') || 'yoimiya';
    this.addTextInput(rightCol, 'Fighter 2 ID', f2Id, 'f2_id');

    const instantCast = localStorage.getItem('dev-instant-cast') === 'true';
    this.addToggle(leftCol, 'Instant Cast (Start)', (val) => {
      localStorage.setItem('dev-instant-cast', val);
      if (val) {
        if (this.gameLoop.fighter1) {
          this.gameLoop.fighter1.skillCDTimer = 0;
          this.gameLoop.fighter1.burstCDTimer = 0;
        }
        if (this.gameLoop.fighter2) {
          this.gameLoop.fighter2.skillCDTimer = 0;
          this.gameLoop.fighter2.burstCDTimer = 0;
        }
      }
    }, instantCast);

    // Initial apply
    if (this.gameLoop.hud) {
      this.gameLoop.hud.setScoreVisibility(bo3Visible);
    }

    const savedHP = localStorage.getItem('dev-hp-config') || 500;
    this.addNumericInput(leftCol, 'HP Config (Integer)', savedHP, (val) => {}, 1, 'hp');

    const savedDmgMult = localStorage.getItem('dev-dmg-multiplier') || 1.0;
    this.addNumericInput(rightCol, 'Damage Multiplier', savedDmgMult, (val) => {}, 0.1, 'dmg');

    const scoreF1 = localStorage.getItem('match-score-cryo') || 0;
    this.addNumericInput(leftCol, `Score: ${f1Name}`, scoreF1, (val) => {}, 1, 'score1');

    const scoreF2 = localStorage.getItem('match-score-pyro') || 0;
    this.addNumericInput(rightCol, `Score: ${f2Name}`, scoreF2, (val) => {}, 1, 'score2');

    const currentVol = parseFloat(localStorage.getItem('dev-master-volume')) ?? 1.0;
    this.addRangeInput(leftCol, 'Master Volume', currentVol, (val) => {
      setMasterVolume(val);
    }, 0, 1, 0.05);

    const arenaColor = localStorage.getItem('dev-arena-color') || '#e2fde6';
    this.addColorInput(leftCol, 'Arena Color', arenaColor, 'arena_color');

    const bgColor = localStorage.getItem('dev-bg-color') || '#a8f5b4';
    this.addColorInput(rightCol, 'Website BG Color', bgColor, 'bg_color');

    this.addButton(leftCol, 'Save & Restart', () => {
      const hp = this.container.querySelector('[data-key="hp"]').value;
      const dmg = this.container.querySelector('[data-key="dmg"]').value;
      const s1 = this.container.querySelector('[data-key="score1"]').value;
      const s2 = this.container.querySelector('[data-key="score2"]').value;
      const f1 = this.container.querySelector('[data-key="f1_id"]').value.toLowerCase().trim();
      const f2 = this.container.querySelector('[data-key="f2_id"]').value.toLowerCase().trim();
      const arena = this.container.querySelector('[data-key="arena_color"]').value;
      const bg = this.container.querySelector('[data-key="bg_color"]').value;

      localStorage.setItem('dev-hp-config', hp);
      localStorage.setItem('dev-dmg-multiplier', dmg);
      localStorage.setItem('match-score-cryo', s1);
      localStorage.setItem('match-score-pyro', s2);
      localStorage.setItem('dev-fighter1-id', f1);
      localStorage.setItem('dev-fighter2-id', f2);
      localStorage.setItem('dev-arena-color', arena);
      localStorage.setItem('dev-bg-color', bg);

      location.reload();
    }, '#2e7d32'); // Green for Save

    this.addButton(rightCol, 'Reset Match Scores', () => {
      localStorage.removeItem('match-score-cryo');
      localStorage.removeItem('match-score-pyro');
      location.reload();
    });

    // ── Export & Import Replay buttons ─────────────
    // Since replayFileActions doesn't have an ID, we'll append to rightCol
    const replayFileActions = document.createElement('div');
    replayFileActions.style.display = 'flex';
    replayFileActions.style.flexDirection = 'column';
    replayFileActions.style.gap = '10px';
    replayFileActions.style.marginTop = '10px';
    rightCol.appendChild(replayFileActions);

    this.addButton(replayFileActions, 'Export Match Replay', () => {
      const frames = this.gameLoop.replayFrames;
      if (!frames || frames.length === 0) {
        alert('No replay frames recorded yet! Complete a match first.');
        return;
      }
      const sfx = this.gameLoop.replaySFXEvents;
      const data = {
        version: '1.0.0',
        winner: this.gameLoop.winner ? this.gameLoop.winner.id : null,
        duration: this.gameLoop.elapsedTime,
        frames: frames,
        sfx: sfx
      };
      const jsonStr = JSON.stringify(data);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `match-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.gachareplay`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, '#0d6efd'); // Blue for export

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.gachareplay,.json';
    fileInput.style.display = 'none';
    replayFileActions.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (!data.frames || !Array.isArray(data.frames)) {
            throw new Error('Invalid replay format: missing frames array.');
          }
          this.gameLoop.replayFrames = data.frames;
          this.gameLoop.replaySFXEvents = data.sfx || [];
          this.gameLoop.winner = data.winner ? { id: data.winner } : null;
          
          this.gameLoop.startReplay();
          console.log(`🎮 Replay imported successfully! ${data.frames.length} frames.`);
        } catch (err) {
          alert(`Failed to load replay: ${err.message}`);
        }
      };
      reader.readAsText(file);
    });

    this.addButton(replayFileActions, 'Import Replay File', () => {
      fileInput.click();
    }, '#198754'); // Green for import

    this.addButton(replayFileActions, '🔍 Instant Sim Extreme-Diff', () => {
      this.gameLoop.runHeadlessSimulation(1000);
    }, '#ff9800'); // Gold for simulation search
  }

  addToggle(parent, label, callback, initialValue = false) {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.cursor = 'pointer';
    row.style.fontSize = '11px';
    row.style.fontWeight = '600';
    row.style.color = '#ccc';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue;
    checkbox.addEventListener('change', (e) => callback(e.target.checked));

    const text = document.createElement('span');
    text.innerText = label;

    row.appendChild(checkbox);
    row.appendChild(text);
    parent.appendChild(row);
  }

  addNumericInput(parent, label, defaultValue, callback, step = 1, key = '') {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    row.style.marginTop = '10px';

    const labelText = document.createElement('span');
    labelText.innerText = label;
    labelText.style.fontSize = '10px';
    labelText.style.fontWeight = '900';
    labelText.style.color = '#8888aa';
    labelText.style.textTransform = 'uppercase';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = defaultValue;
    input.step = step;
    if (key) input.setAttribute('data-key', key);
    input.className = 'dev-input'; // We'll add some CSS for this
    input.style.width = '100%';
    input.style.backgroundColor = '#1a1a2e';
    input.style.color = 'white';
    input.style.border = '2px solid #000';
    input.style.padding = '8px';
    input.style.borderRadius = '0px';
    input.style.fontFamily = 'inherit';
    input.style.fontSize = '14px';
    input.style.fontWeight = '700';

    input.addEventListener('change', (e) => callback(e.target.value));

    row.appendChild(labelText);
    row.appendChild(input);
    parent.appendChild(row);
  }

  addTextInput(parent, label, defaultValue, key = '') {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    row.style.marginTop = '10px';

    const labelText = document.createElement('span');
    labelText.innerText = label;
    labelText.style.fontSize = '10px';
    labelText.style.fontWeight = '900';
    labelText.style.color = '#8888aa';
    labelText.style.textTransform = 'uppercase';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    if (key) input.setAttribute('data-key', key);
    input.style.width = '100%';
    input.style.backgroundColor = '#1a1a2e';
    input.style.color = 'white';
    input.style.border = '2px solid #000';
    input.style.padding = '8px';
    input.style.borderRadius = '0px';
    input.style.fontFamily = 'inherit';
    input.style.fontSize = '14px';
    input.style.fontWeight = '700';

    row.appendChild(labelText);
    row.appendChild(input);
    parent.appendChild(row);
  }

  addRangeInput(parent, label, defaultValue, callback, min = 0, max = 1, step = 0.01) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    row.style.marginTop = '10px';

    const labelText = document.createElement('span');
    labelText.innerText = label;
    labelText.style.fontSize = '10px';
    labelText.style.fontWeight = '900';
    labelText.style.color = '#8888aa';
    labelText.style.textTransform = 'uppercase';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = defaultValue;
    input.style.width = '100%';
    input.style.cursor = 'pointer';

    input.addEventListener('input', (e) => callback(parseFloat(e.target.value)));

    row.appendChild(labelText);
    row.appendChild(input);
    parent.appendChild(row);
  }

  addButton(parent, label, callback, bgColor = '#d32f2f') {
    const btn = document.createElement('button');
    btn.innerText = label;
    btn.style.width = '100%';
    btn.style.padding = '8px';
    btn.style.marginTop = '10px';
    btn.style.backgroundColor = bgColor;
    btn.style.color = 'white';
    btn.style.border = '2px solid #000';
    btn.style.fontWeight = '800';
    btn.style.textTransform = 'uppercase';
    btn.style.fontSize = '10px';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', callback);
    parent.appendChild(btn);
  }

  addColorInput(parent, label, defaultValue, key = '') {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    row.style.marginTop = '10px';

    const labelText = document.createElement('span');
    labelText.innerText = label;
    labelText.style.fontSize = '10px';
    labelText.style.fontWeight = '900';
    labelText.style.color = '#8888aa';
    labelText.style.textTransform = 'uppercase';

    const input = document.createElement('input');
    input.type = 'color';
    input.value = defaultValue;
    if (key) input.setAttribute('data-key', key);
    input.style.width = '100%';
    input.style.height = '30px';
    input.style.backgroundColor = '#1a1a2e';
    input.style.border = '2px solid #000';
    input.style.cursor = 'pointer';

    row.appendChild(labelText);
    row.appendChild(input);
    parent.appendChild(row);
  }
}
