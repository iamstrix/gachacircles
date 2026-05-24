/**
 * CharacterData.js — Extensible character registry for Gacha Circles
 * Add new characters by adding entries to the CHARACTERS object.
 */

export const ELEMENTS = {
  CRYO: 'cryo',
  PYRO: 'pyro',
  HYDRO: 'hydro',
  ELECTRO: 'electro',
  ANEMO: 'anemo',
  GEO: 'geo',
  DENDRO: 'dendro',
};

export const WEAPONS = {
  SWORD: 'sword',
  BOW: 'bow',
  CLAYMORE: 'claymore',
  POLEARM: 'polearm',
  CATALYST: 'catalyst',
};

export const CHARACTERS = {
  ayaka: {
    id: 'ayaka',
    name: 'Kamisato Ayaka',
    title: 'Frostflake Heron',
    element: ELEMENTS.CRYO,
    weapon: WEAPONS.SWORD,

    // Combat stats
    hp: 500,
    damage: 8,
    attackSpeed: 1.0,       // Attacks per second during collision
    speed: 3.0,             // Movement speed multiplier

    // Skills & Burst
    skillE: {
      name: 'Kamisato Art: Hyouka',
      description: 'Summons blooming ice dealing AoE Cryo damage and repelling opponents',
      damageMultiplier: 2.0,
      cooldown: 7,
      emoji: '❄️',
      icon: '/ayaka-skill_icon.png'
    },
    burstQ: {
      name: 'Kamisato Art: Soumetsu',
      description: 'Releases a freezing ice cyclone that ticks continuous Cryo damage',
      damageMultiplier: 1.2,
      duration: 3000,       // ticks over 3s
      aoeRadius: 140,
      cooldown: 18,
      emoji: '🌀',
      icon: '/ayaka-ultimate_icon.png'
    },
    passive: {
      name: 'Kanten Senmyou Blessing',
      description: 'Elemental skill grants +30% Normal Attack DMG and Cryo Infusion for 4s',
      duration: 4000,
      emoji: '⚔️'
    },

    // Visual config
    circleRadius: 42,
    portrait: '/characters/ayaka_portrait.png',
    splash: '/characters/ayaka-splash.png',
    ultAnimation: '/characters/ayaka-ultimate_animation.mp4',
    weaponSprite: '/weapons/sword.png',
    colors: {
      primary: '#4FC3F7',
      light: '#B3E5FC',
      dark: '#0288D1',
      glow: 'rgba(79, 195, 247, 0.4)',
      circle: '#1a3a5c',
      circleStroke: '#4FC3F7',
    },
  },

  yoimiya: {
    id: 'yoimiya',
    name: 'Yoimiya',
    title: 'Frolicking Flames',
    element: ELEMENTS.PYRO,
    weapon: WEAPONS.BOW,

    // Combat stats
    hp: 500,
    damage: 6,
    attackSpeed: 2.5,       // Faster base attacks
    speed: 3.5,             // Slightly faster movement

    // Skills & Burst
    skillE: {
      name: 'Niwabi Fire-Dance',
      description: 'Pyro infusion: deals +50% damage and doubles attack speed for 7s',
      cooldown: 10,
      duration: 7000,
      emoji: '🔥',
      icon: '/yoimiya-skill_icon.png'
    },
    burstQ: {
      name: 'Ryuukin Saxifrage',
      description: 'Fires a rocket shower dealing massive instant AoE Pyro damage',
      damageMultiplier: 4.0,
      aoeRadius: 160,
      cooldown: 15,
      emoji: '🎆',
      icon: '/yoimiya-ultimate_icon.png'
    },
    passive: {
      name: 'Tricks of the Trouble-Maker',
      description: 'Normal attacks stack +2% damage up to 10 stacks (max +20%) for 3s',
      duration: 3000,
      emoji: '🎯'
    },

    // Visual config
    circleRadius: 42,
    portrait: '/characters/yoimiya_portrait.png',
    splash: '/characters/yoimiya-splash.png',
    ultAnimation: '/characters/yoimiya-ultimate_animation.mp4',
    weaponSprite: '/weapons/bow.png',
    colors: {
      primary: '#FF9800',
      light: '#FFE082',
      dark: '#E65100',
      glow: 'rgba(255, 152, 0, 0.4)',
      circle: '#5c3a1a',
      circleStroke: '#FF9800',
    },
  },
};

/**
 * Get character data by ID
 */
export function getCharacter(id) {
  const char = CHARACTERS[id];
  if (!char) throw new Error(`Character "${id}" not found`);
  return { ...char };
}

/**
 * Get all available character IDs
 */
export function getCharacterIds() {
  return Object.keys(CHARACTERS);
}
