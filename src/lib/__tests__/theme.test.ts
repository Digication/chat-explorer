import { describe, it, expect } from 'vitest';
import { lightTheme, sidebarTheme } from '../theme';

describe('Theme configuration', () => {
  it('light theme has Digication primary color', () => {
    expect(lightTheme.palette.primary.main).toBe('#1976d2');
  });

  it('sidebar theme uses GlobalHeader background', () => {
    expect(sidebarTheme.palette.background.default).toBe('#26282b');
  });

  it('light theme uses Helvetica Neue font family', () => {
    expect(lightTheme.typography.fontFamily).toContain('Helvetica Neue');
  });

  it('light theme uses 5px spacing unit', () => {
    expect(lightTheme.spacing(1)).toBe('5px');
  });
});
