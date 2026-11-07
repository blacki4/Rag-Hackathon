/** Tiny mutable stores read inside useFrame (no React re-render per frame). */

export const scrollState = { p: 0, dive: false };

/** Set by the chat page when an answer arrives; the 3D background reacts to it. */
export const chatPulse = { at: -100, refused: false, seed: 1, thinking: false };
