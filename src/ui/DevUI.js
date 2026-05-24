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

    const group = document.createElement('div');
    group.className = 'dev-button-group';
    group.style.marginTop = '0';
    this.container.appendChild(group);

    this.addToggle(group, 'Invincible: Ayaka', (val) => {
      this.gameLoop.fighter1.isInvincible = val;
    });

    this.addToggle(group, 'Invincible: Yoimiya', (val) => {
      this.gameLoop.fighter2.isInvincible = val;
    });

    this.addNumericInput(group, 'HP Config (Integer)', savedHP, (val) => {
      // Manual save via button now
    }, 1, 'hp');

    const savedDmgMult = localStorage.getItem('dev-dmg-multiplier') || 1.0;
    this.addNumericInput(group, 'Damage Multiplier (Float)', savedDmgMult, (val) => {
      // Manual save via button now
    }, 0.1, 'dmg');

    const scoreAyaka = localStorage.getItem('match-score-cryo') || 0;
    this.addNumericInput(group, 'Score: Ayaka', scoreAyaka, (val) => {
      // Manual save via button now
    }, 1, 'score1');

    const scoreYoimiya = localStorage.getItem('match-score-pyro') || 0;
    this.addNumericInput(group, 'Score: Yoimiya', scoreYoimiya, (val) => {
      // Manual save via button now
    }, 1, 'score2');

    const currentVol = parseFloat(localStorage.getItem('dev-master-volume')) ?? 1.0;
    this.addRangeInput(group, 'Master Volume', currentVol, (val) => {
      setMasterVolume(val);
    }, 0, 1, 0.05);

    this.addButton(group, 'Save & Restart', () => {
      const hp = this.container.querySelector('[data-key="hp"]').value;
      const dmg = this.container.querySelector('[data-key="dmg"]').value;
      const s1 = this.container.querySelector('[data-key="score1"]').value;
      const s2 = this.container.querySelector('[data-key="score2"]').value;

      localStorage.setItem('dev-hp-config', hp);
      localStorage.setItem('dev-dmg-multiplier', dmg);
      localStorage.setItem('match-score-cryo', s1);
      localStorage.setItem('match-score-pyro', s2);

      location.reload();
    }, '#2e7d32'); // Green for Save

    this.addButton(group, 'Reset Match Scores', () => {
      localStorage.removeItem('match-score-cryo');
      localStorage.removeItem('match-score-pyro');
      location.reload();
    });
  }

  addToggle(parent, label, callback) {
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
}
