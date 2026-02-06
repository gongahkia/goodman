
export interface Point {
    x: number;
    y: number;
}

export interface Dimensions {
    width: number;
    height: number;
}

export interface Rect extends Point, Dimensions {
    bottom: number;
    right: number;
}

export interface ViewportInfo {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
}

/**
 * Calculates the position for the popup relative to the target selection.
 * Implements "Smart Positioning" to flip above/below and clamp horizontally to stay in viewport.
 */
export function calculatePopupPosition(
    target: DOMRect,
    popup: Dimensions,
    gap = 8
): Point {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 1. Horizontal Positioning (Center)
    // Calculate left relative to viewport
    let left = target.left + (target.width / 2) - (popup.width / 2);

    // Clamp Horizontal to prevent overflow (viewport relative)
    if (left < gap) {
        left = gap; // Keep a small gap from left edge
    } else if (left + popup.width > viewportWidth - gap) {
        left = viewportWidth - popup.width - gap; // Keep gap from right edge
    }

    // 2. Vertical Positioning (Smart Flip)
    // Default: Position above the selection
    let top = target.top - popup.height - gap;

    // Check collision with top of viewport
    if (top < 0) {
        // Not enough space above, try below
        const belowY = target.bottom + gap;

        // Check if fits below
        if (belowY + popup.height <= viewportHeight) {
            top = belowY;
        } else {
            // Fits neither perfectly? Pick the side with more space.
            // Space Above vs Space Below
            if (target.top > (viewportHeight - target.bottom)) {
                // More space above, allow it to clip top? Or clamp?
                // Usually allow clip or sticky top. Let's clamp to 0.
                top = gap;
            } else {
                // More space below, clamp to bottom
                top = viewportHeight - popup.height - gap;
            }
        }
    }

    // Return Absolute Page Coordinates
    return {
        x: left + scrollX,
        y: top + scrollY
    };
}
