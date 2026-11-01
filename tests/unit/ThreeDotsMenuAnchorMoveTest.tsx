import {act, fireEvent, render, screen} from '@testing-library/react-native';

import ThreeDotsMenu from '@components/ThreeDotsMenu';

import CONST from '@src/CONST';

import type {ReactNode} from 'react';

import React from 'react';

type MockPopoverMenuProps = {isVisible?: boolean; anchorPosition?: {horizontal: number; vertical: number}};

const mockMeasuredAnchor = {horizontal: 0, vertical: 0, width: 40, height: 40};
const mockWindowDimensions = {windowWidth: 1100, windowHeight: 800};
const mockAnchorObserver: {onMove?: () => void; armCount: number; stopCount: number} = {armCount: 0, stopCount: 0};

/** Records every `PopoverMenu` render so assertions can read the `anchorPosition` it was last given while open. */
const mockPopoverRender = jest.fn<void, [MockPopoverMenuProps]>();

/** Defined once so `ThreeDotsMenu`'s `getMenuPosition` keeps its identity across renders, like the real hook's. */
const mockCalculatePopoverPosition = () => Promise.resolve({...mockMeasuredAnchor});

jest.mock('@hooks/useWindowDimensions', () => () => mockWindowDimensions);

jest.mock('@hooks/usePopoverPosition', () => () => ({calculatePopoverPosition: mockCalculatePopoverPosition}));

jest.mock('@hooks/useOnyx', () => () => [undefined, {status: 'loaded'}]);

jest.mock('@libs/observeAnchorMove', () => (element: unknown, onMove: () => void) => {
    mockAnchorObserver.armCount++;
    mockAnchorObserver.onMove = onMove;
    return () => {
        mockAnchorObserver.stopCount++;
    };
});

jest.mock('@components/PopoverMenu', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest.requireActual returns an untyped module; standard RN-mock pattern in this repo.
    const {View: RNView} = jest.requireActual('react-native');
    function MockPopoverMenu({isVisible, anchorPosition}: MockPopoverMenuProps) {
        mockPopoverRender({isVisible, anchorPosition});
        return <RNView testID={isVisible ? 'popover-open' : 'popover-closed'} />;
    }
    return MockPopoverMenu;
});

jest.mock('@components/Icon', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest.requireActual returns an untyped module; standard RN-mock pattern in this repo.
    const {View: RNView} = jest.requireActual('react-native');
    function MockIcon() {
        return <RNView />;
    }
    return MockIcon;
});

jest.mock('@components/Tooltip/PopoverAnchorTooltip', () => {
    function MockTooltip({children}: {children?: ReactNode}) {
        return children;
    }
    return MockTooltip;
});

jest.mock('@components/Tooltip/EducationalTooltip', () => {
    function MockEducationalTooltip({children}: {children?: ReactNode}) {
        return children;
    }
    return MockEducationalTooltip;
});

const anchorAlignment = {horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.RIGHT, vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.TOP};
const menuItems = [{text: 'Delete', onSelected: () => {}}];
const menuElement = (
    <ThreeDotsMenu
        shouldSelfPosition
        testID="three-dots-menu"
        menuItems={menuItems}
        anchorAlignment={anchorAlignment}
    />
);

const setMeasuredAnchor = (horizontal: number, vertical: number) => {
    mockMeasuredAnchor.horizontal = horizontal;
    mockMeasuredAnchor.vertical = vertical;
};

/** The `anchorPosition` from the most recent render in which the popover was open. */
const lastOpenAnchorPosition = () => mockPopoverRender.mock.calls.map(([props]) => props).findLast((props) => props.isVisible)?.anchorPosition;

/** Lets pending position measurements settle. */
const flushPendingMeasurements = () =>
    act(async () => {
        jest.advanceTimersByTime(0);
    });

const openMenu = async () => {
    const view = render(menuElement);
    fireEvent.press(screen.getByTestId('three-dots-menu'));
    await flushPendingMeasurements();
    return view;
};

describe('ThreeDotsMenu follows its button while open', () => {
    beforeEach(() => {
        setMeasuredAnchor(1000, 300);
        mockWindowDimensions.windowWidth = 1100;
        mockWindowDimensions.windowHeight = 800;
        mockPopoverRender.mockClear();
        mockAnchorObserver.onMove = undefined;
        mockAnchorObserver.armCount = 0;
        mockAnchorObserver.stopCount = 0;
    });

    it('measures the button again when it moves after the window was resized', async () => {
        // Given an open menu anchored to its button
        const {rerender} = await openMenu();
        expect(screen.getByTestId('popover-open')).toBeOnTheScreen();
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1000);

        // When the window gets wider, the menu measures in that same commit, before a virtualized list has given the
        // row its new width, so the button is still where it was
        mockWindowDimensions.windowWidth = 1280;
        rerender(menuElement);
        await flushPendingMeasurements();
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1000);

        // ...and the list then re-lays out the row, which moves the button
        setMeasuredAnchor(1180, 300);
        await act(async () => {
            mockAnchorObserver.onMove?.();
        });

        // Then the menu is moved under the button
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1180);
    });

    it('follows the button after a burst of fast resizes, without waiting for a timer', async () => {
        // Given an open menu anchored to its button
        const {rerender} = await openMenu();

        // When the window is resized several times in a row (a fast drag, or snapping into split view), every commit
        // measures before the list has re-laid out the row, so each measurement still sees the button where it was
        for (const width of [1150, 1200, 1250, 1280]) {
            mockWindowDimensions.windowWidth = width;
            rerender(menuElement);
        }
        await flushPendingMeasurements();
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1000);

        // ...and the list then moves the button once it settles
        setMeasuredAnchor(1180, 300);
        await act(async () => {
            mockAnchorObserver.onMove?.();
        });

        // Then the menu follows at once. No debounce timer was advanced, so the result doesn't depend on resize speed
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1180);
    });

    it('keeps watching the button where it was last measured', async () => {
        // Given an open menu whose button moved once already
        await openMenu();
        setMeasuredAnchor(1180, 300);
        const armCountBeforeMove = mockAnchorObserver.armCount;

        // When the observer reports the move
        await act(async () => {
            mockAnchorObserver.onMove?.();
        });

        // Then the observer is re-armed for the new position, so a second move is caught too
        expect(mockAnchorObserver.armCount).toBe(armCountBeforeMove + 1);
        expect(mockAnchorObserver.stopCount).toBe(armCountBeforeMove);
    });

    it('does not re-arm the observer when the button did not actually move', async () => {
        // Given an open menu
        await openMenu();
        const armCountBeforeReport = mockAnchorObserver.armCount;

        // When the observer reports a change but the button is measured at the same place, as happens when it is
        // partly clipped by a scroll container
        await act(async () => {
            mockAnchorObserver.onMove?.();
        });

        // Then the position object is kept, so the observer is not re-armed in a loop
        expect(mockAnchorObserver.armCount).toBe(armCountBeforeReport);
        expect(lastOpenAnchorPosition()?.horizontal).toBe(1000);
    });

    it('stops watching the button when the menu closes', async () => {
        // Given an open menu that is watching its button
        await openMenu();
        expect(mockAnchorObserver.armCount).toBeGreaterThan(0);

        // When the menu is closed
        fireEvent.press(screen.getByTestId('three-dots-menu'));
        await flushPendingMeasurements();

        // Then every observer it armed has been stopped, so nothing measures a closed menu
        expect(screen.getByTestId('popover-closed')).toBeOnTheScreen();
        expect(mockAnchorObserver.stopCount).toBe(mockAnchorObserver.armCount);
    });
});
