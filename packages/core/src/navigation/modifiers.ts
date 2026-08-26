import type { ModifierKey } from "../types";

export interface ModifierKeyState {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function modifierPressed(
  event: ModifierKeyState,
  modifier?: ModifierKey,
): boolean {
  if (!modifier || modifier === "none") return true;
  switch (modifier) {
    case "shift":
      return event.shiftKey;
    case "ctrl":
      return event.ctrlKey;
    case "alt":
      return event.altKey;
    case "meta":
      return event.metaKey;
    default:
      return false;
  }
}
