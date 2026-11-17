// Player settings (volumes, camera shake, 3D or classic camera), remembered in localStorage.

const SETTINGS_KEY = 'halcyonKeys.settings.v1';

export const DEFAULT_SETTINGS = { master: 0.8, music: 0.6, sfx: 0.8, shake: 1, view: '3d' };

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function storeSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable; settings then last for this visit only.
  }
}

/** The adjustable rows of the settings menu. */
export const SETTING_ROWS = [
  { key: 'master', label: 'Master volume', step: 0.1 },
  { key: 'music', label: 'Radio & music', step: 0.1 },
  { key: 'sfx', label: 'Sound effects', step: 0.1 },
  { key: 'shake', label: 'Camera shake', step: 0.25 },
];
