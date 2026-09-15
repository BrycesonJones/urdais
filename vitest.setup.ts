import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no ResizeObserver. Components that observe their own size (the news
// rail scroller) mount and unmount correctly with an inert one; what the
// observer would report is layout, which is verified in a browser, not here.
if (!("ResizeObserver" in globalThis)) {
  class InertResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: InertResizeObserver, writable: true });
}

afterEach(() => cleanup());
