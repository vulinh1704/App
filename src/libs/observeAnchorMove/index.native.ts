import type ObserveAnchorMove from './types';

/** Native has no IntersectionObserver. Anchored popovers are repositioned when the window size changes instead. */
const observeAnchorMove: ObserveAnchorMove = () => () => {};

export default observeAnchorMove;
