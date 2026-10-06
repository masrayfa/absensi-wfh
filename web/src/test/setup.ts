import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom implements neither object-URL factory; PhotoUpload previews need them.
URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name || 'preview'}`);
URL.revokeObjectURL = vi.fn();

// jsdom lacks pointer capture and ResizeObserver, which Radix primitives (Select) touch.
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
});
