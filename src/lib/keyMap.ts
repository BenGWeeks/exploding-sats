// Keyboard, matching the C64 original: a 3x3 letter grid is the joystick and SHIFT is fire.
// Player 1: Q W E / A D / Z X C (or the arrow keys), fire = left Shift or Space.
// Not Ctrl: the browser acts on Ctrl+W (close tab) and Ctrl+Q (quit) and a page can't prevent it.
// Player 2: P [ ] / L ' / , . / (the C64's P @ * / L ; / , . /), fire = right Shift or Enter.
// Keyed by KeyboardEvent.code so the layout is the same whatever the keyboard language.
export type KeyRole = 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight' | 'fire';
export const P1_KEYS: Record<string, KeyRole> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyQ: 'upLeft', KeyW: 'up', KeyE: 'upRight',
  KeyA: 'left', KeyD: 'right',
  KeyZ: 'downLeft', KeyX: 'down', KeyC: 'downRight',
  Space: 'fire', ShiftLeft: 'fire',
};
export const P2_KEYS: Record<string, KeyRole> = {
  KeyP: 'upLeft', BracketLeft: 'up', BracketRight: 'upRight',
  KeyL: 'left', Quote: 'right',
  Comma: 'downLeft', Period: 'down', Slash: 'downRight',
  ShiftRight: 'fire', Enter: 'fire', NumpadEnter: 'fire',
};
