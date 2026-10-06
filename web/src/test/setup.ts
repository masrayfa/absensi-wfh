import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom implements neither object-URL factory; PhotoUpload previews need them.
URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name || 'preview'}`);
URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
});
