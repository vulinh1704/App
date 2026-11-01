/**
 * Calls `onMove` once `element` is no longer in the box it occupied when this was called, i.e. it moved or resized.
 * Returns a function that stops watching.
 */
type ObserveAnchorMove = (element: unknown, onMove: () => void) => () => void;

export default ObserveAnchorMove;
