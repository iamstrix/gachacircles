/**
 * DevUI.js — Developer debug overlay
 * Provides toggles for testing and debugging.
 */
export class DevUI {
  constructor(gameLoop) {
    this.gameLoop = gameLoop;
    this.container = document.createElement('div');
    this.setupStyles();
    this.createControls();
    document.body.appendChild(this.container);
  }

  setupStyles() {
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '20px',
      top: '50%',
      transform: 'translateY(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: '1000',
      border: '1px solid #444',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'auto'
    });
  }

  createControls() {
    const title = document.createElement('div');
    title.innerText = 'DEV CONTROLS';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '5px';
    title.style.color = '#ff9800';
    this.container.appendChild(title);

    this.addToggle('Invincible: Ayaka', (val) => {
      this.gameLoop.fighter1.isInvincible = val;
    });

    this.addToggle('Invincible: Yoimiya', (val) => {
      this.gameLoop.fighter2.isInvincible = val;
    });
  }

  addToggle(label, callback) {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', (e) => callback(e.target.checked));

    const text = document.createElement('span');
    text.innerText = label;

    row.appendChild(checkbox);
    row.appendChild(text);
    this.container.appendChild(row);
  }
}
