# Gacha Circles

A 2D combat simulation featuring characters inspired by Genshin Impact. Characters fight as physics-based circles with unique abilities, elemental effects, and sound design.

## Features

- Physics-driven combat using a custom engine.
- Elemental reaction system (Pyro, Hydro, Cryo, Electro).
- Character-specific behaviors for Ayaka, Yoimiya, Ayato, and Keqing.
- Visual effects including particle systems and elemental overlays.
- Audio integration for attacks, skills, and environmental hits.
- Development UI for real-time debugging and performance monitoring.

## Technical Stack

- Language: JavaScript (ES6+)
- Rendering: HTML5 Canvas API
- Physics: Custom 2D implementation
- Assets: Local PNG images and WAV/MP3 audio files

## Project Structure

- `src/main.js`: Entry point and initialization.
- `src/gameLoop.js`: Main update and render cycles.
- `src/physics.js`: Collision detection and resolution.
- `src/characters/`: Character logic and state management.
- `src/vfx/`: Particle systems and elemental visual effects.
- `src/ui/`: HUD and developer interface.
- `public/`: Static assets including audio and images.

## Setup

1. Clone the repository.
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open the local address in a web browser.

## Development

The game uses a character registry to manage fighters. New characters can be added by creating a behavior class in `src/characters/behaviors/` and registering them in `CharacterRegistry.js`.
