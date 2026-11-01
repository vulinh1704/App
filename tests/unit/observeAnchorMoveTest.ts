import type * as WebModule from '@libs/observeAnchorMove/index.ts';

// Jest resolves the bare specifier to the native file, so the web variant is loaded by its explicit path.
const {default: observeAnchorMove} = jest.requireActual<typeof WebModule>('@libs/observeAnchorMove/index.ts');

type ReportedEntry = Pick<IntersectionObserverEntry, 'intersectionRatio'>;

/** jsdom has no IntersectionObserver, so this stand-in records how it was set up and lets a test report ratios. */
class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];

    callback: (entries: ReportedEntry[]) => void;

    options: IntersectionObserverInit | undefined;

    observedElement: Element | undefined;

    isDisconnected = false;

    constructor(callback: (entries: ReportedEntry[]) => void, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.options = options;
        MockIntersectionObserver.instances.push(this);
    }

    observe(element: Element) {
        this.observedElement = element;
    }

    disconnect() {
        this.isDisconnected = true;
    }

    report(intersectionRatio: number) {
        this.callback([{intersectionRatio}]);
    }
}

const VIEWPORT = {width: 1280, height: 800};

function createElementAt({top, left, width, height}: {top: number; left: number; width: number; height: number}) {
    const element = document.createElement('div');
    const rect = {x: left, y: top, top, left, width, height, right: left + width, bottom: top + height, toJSON: () => ({})};
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
    return element;
}

const lastObserver = () => MockIntersectionObserver.instances.at(-1);

describe('observeAnchorMove (web)', () => {
    beforeEach(() => {
        MockIntersectionObserver.instances = [];
        Object.defineProperty(globalThis, 'IntersectionObserver', {value: MockIntersectionObserver, configurable: true, writable: true});
        jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(VIEWPORT.width);
        jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(VIEWPORT.height);
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'IntersectionObserver');
        jest.restoreAllMocks();
    });

    it('shrinks the observer root to the element box', () => {
        // Given a 28px button near the right edge of a 1280x800 viewport
        const element = createElementAt({top: 100, left: 1000, width: 28, height: 28});

        // When it is observed
        observeAnchorMove(element, jest.fn());

        // Then the root margins cut the viewport down to exactly that box, and only a full overlap counts
        expect(lastObserver()?.options).toEqual({rootMargin: '-100px -252px -672px -1000px', threshold: 1});
        expect(lastObserver()?.observedElement).toBe(element);
    });

    it('ignores the first report while the element is still in its box', () => {
        // Given an observed element
        const onMove = jest.fn();
        observeAnchorMove(createElementAt({top: 100, left: 1000, width: 28, height: 28}), onMove);

        // When the observer reports the starting state, fully inside the root
        lastObserver()?.report(1);

        // Then nothing has moved yet
        expect(onMove).not.toHaveBeenCalled();
    });

    it('calls onMove once the element leaves its box', () => {
        // Given an observed element that started inside its box
        const onMove = jest.fn();
        observeAnchorMove(createElementAt({top: 100, left: 1000, width: 28, height: 28}), onMove);
        lastObserver()?.report(1);

        // When a list re-layout moves it, so it only partly overlaps the box
        lastObserver()?.report(0.4);

        // Then the caller is told to measure again
        expect(onMove).toHaveBeenCalledTimes(1);
    });

    it('calls onMove when the element moved before the first report', () => {
        // Given an observed element
        const onMove = jest.fn();
        observeAnchorMove(createElementAt({top: 100, left: 1000, width: 28, height: 28}), onMove);

        // When it already left its box by the time the observer first runs
        lastObserver()?.report(0);

        // Then the caller is told to measure again right away
        expect(onMove).toHaveBeenCalledTimes(1);
    });

    it('disconnects when stopped', () => {
        // Given an observed element
        const stop = observeAnchorMove(createElementAt({top: 100, left: 1000, width: 28, height: 28}), jest.fn());

        // When the caller stops watching, for example because the menu closed
        stop();

        // Then the observer is released
        expect(lastObserver()?.isDisconnected).toBe(true);
    });

    it('does nothing for a node it cannot measure', () => {
        // Given something that is not a DOM element, and an element with no size
        const notAnElement = {};
        const emptyElement = createElementAt({top: 0, left: 0, width: 0, height: 0});

        // When they are observed
        observeAnchorMove(notAnElement, jest.fn());
        observeAnchorMove(emptyElement, jest.fn());

        // Then no observer is created
        expect(MockIntersectionObserver.instances).toHaveLength(0);
    });
});
