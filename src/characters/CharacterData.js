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

/**
 * Weapon attack type — drives combat dispatch in gameLoop.
 * 'melee' : close-range combo fighter
 * 'ranged': fires projectiles from a distance
 */
export const ATTACK_TYPE = {
  MELEE: 'melee',
  RANGED: 'ranged',
};

export const CHARACTERS = {
  ayaka: {
    id: 'ayaka',
    name: 'Kamisato Ayaka',
    title: 'Frostflake Heron',
    element: ELEMENTS.CRYO,
    weapon: WEAPONS.SWORD,
    attackType: ATTACK_TYPE.MELEE,

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
    attackType: ATTACK_TYPE.RANGED,

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

  keqing: {
    id: 'keqing',
    name: 'Keqing',
    title: 'Driving Thunder',
    element: ELEMENTS.ELECTRO,
    weapon: WEAPONS.SWORD,
    attackType: ATTACK_TYPE.MELEE,

    // Combat stats
    hp: 500,
    damage: 9,              // Slightly higher base melee damage
    attackSpeed: 1.2,       // Slightly faster than Ayaka
    speed: 3.8,             // Very agile — fastest on foot

    // Skills & Burst
    skillE: {
      name: 'Stellar Restoration',
      description: 'Throws a Lightning Stiletto. Re-casting teleports Keqing to it, dealing AoE Electro damage.',
      damageMultiplier: 2.5,
      cooldown: 8,
      teleportRadius: 120,  // AoE radius on teleport detonation
      emoji: '⚡',
      icon: '/keqing-skill_icon.png'
    },
    burstQ: {
      name: 'Starward Sword',
      description: 'Unleashes a rapid fan of 8 lightning slashes, then detonates a massive Electro explosion.',
      damageMultiplier: 1.5,  // per slash
      slashCount: 8,
      explosionMultiplier: 3.0,
      aoeRadius: 150,
      cooldown: 20,
      emoji: '🗡️',
      icon: '/keqing-ultimate_icon.png'
    },
    passive: {
      name: 'Thundering Poise',
      description: 'After using Stellar Restoration, Normal Attacks deal +25% Electro DMG for 5s.',
      duration: 5000,
      emoji: '💜'
    },

    // Visual config
    circleRadius: 42,
    portrait: '/characters/keqing_portrait.png',
    splash: '/characters/keqing-splash.png',
    ultAnimation: '/characters/keqing-ultimate_animation.mp4',
    weaponSprite: '/weapons/sword.png',
    colors: {
      primary: '#c77dff',
      light: '#e0b0ff',
      dark: '#7b2d8b',
      glow: 'rgba(199, 125, 255, 0.45)',
      circle: '#2d1a40',
      circleStroke: '#c77dff',
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
