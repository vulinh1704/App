import isHTMLElement from '@libs/isHTMLElement';

import type ObserveAnchorMove from './types';

/**
 * Watches the element with an IntersectionObserver whose root is shrunk to the element's current box. While the element
 * stays in that box the intersection ratio is 1. Once it moves or resizes by a pixel or more, for example because a
 * virtualized list gave the row that holds it a new width, the ratio drops below 1 and `onMove` is called. This is the
 * technique Floating UI's `autoUpdate` uses to detect layout shifts.
 */
const observeAnchorMove: ObserveAnchorMove = (element, onMove) => {
    if (!isHTMLElement(element) || typeof IntersectionObserver === 'undefined') {
        return () => {};
    }

    const {top, left, width, height} = element.getBoundingClientRect();
    if (!width || !height) {
        return () => {};
    }

    // The margins are relative to the viewport, so callers re-arm this after the window size changes.
    const {clientWidth, clientHeight} = document.documentElement;
    const rootMargin = [top, clientWidth - (left + width), clientHeight - (top + height), left].map((inset) => `${-Math.floor(inset)}px`).join(' ');

    let isFirstCallback = true;
    const observer = new IntersectionObserver(
        ([entry]) => {
            const isInitialState = isFirstCallback;
            isFirstCallback = false;

            // The first callback only reports the starting state. A ratio below 1 there means the element moved between
            // being measured and being observed, or it is partly clipped, so the caller should check it once more.
            if (isInitialState && (entry?.intersectionRatio ?? 0) >= 1) {
                return;
            }
            onMove();
        },
        {rootMargin, threshold: 1},
    );
    observer.observe(element);

    return () => observer.disconnect();
};

export default observeAnchorMove;
