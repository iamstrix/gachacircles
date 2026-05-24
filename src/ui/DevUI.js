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

    const savedHP = localStorage.getItem('dev-hp-config') || 500;
    this.addNumericInput(group, 'HP Config (Integer)', savedHP, (val) => {
      const hp = parseInt(val, 10);
      if (isNaN(hp) || hp <= 0) return;
      
      // Save to localStorage so it persists across the restart
      localStorage.setItem('dev-hp-config', hp);
      
      // Full game restart
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

  addNumericInput(parent, label, defaultValue, callback) {
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
}
