/**
 * CharacterRegistry.js — Central registry for all characters, behaviors, and VFX.
 */

import { AyakaBehavior } from './behaviors/AyakaBehavior.js';
import { YoimiyaBehavior } from './behaviors/YoimiyaBehavior.js';
import { KeqingBehavior } from './behaviors/KeqingBehavior.js';
import { getCharacter } from './CharacterData.js';

const BEHAVIORS = {
  ayaka: AyakaBehavior,
  yoimiya: YoimiyaBehavior,
  keqing: KeqingBehavior,
};

/**
 * Get all registration info for a character by ID
 */
export function getCharacterRegistry(id) {
  const data = getCharacter(id);
  const behavior = BEHAVIORS[id];

  if (!behavior) {
    throw new Error(`Behavior for character "${id}" not found`);
  }

  return {
    data,
    behavior,
  };
}

/**
 * Get all available character IDs
 */
export function getAvailableCharacterIds() {
  return Object.keys(BEHAVIORS);
}
