/** Site-wide sound switch, remembered in the browser. */
const STORAGE_KEY = 'soundMuted';

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
}

export function setSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch (error) {
    console.error(error);
  }
}

/** Play a sound effect unless sounds are turned off. */
export function playSound(sound: HTMLAudioElement | null | undefined) {
  if (!sound || isSoundMuted()) {
    return;
  }
  sound.currentTime = 0;
  sound.play().catch(() => {
    // Browsers block audio before the first user interaction; ignore.
  });
}
