import { describe, it, expect } from 'vitest';
import { lightTheme, darkTheme, sidebarTheme } from '../theme';

describe('Theme configuration', () => {
  it('light theme has Digication primary color', () => {
    expect(lightTheme.palette.primary.main).toBe('#0288D1');
  });

  it('dark theme uses Digication dark backgrounds', () => {
    expect(darkTheme.palette.background.default).toBe('#212121');
    expect(darkTheme.palette.background.paper).toBe('#323232');
  });

  it('sidebar theme uses GlobalHeader background', () => {
    expect(sidebarTheme.palette.background.default).toBe('#26282b');
  });

  it('all themes use Helvetica Neue font family', () => {
    expect(lightTheme.typography.fontFamily).toContain('Helvetica Neue');
    expect(darkTheme.typography.fontFamily).toContain('Helvetica Neue');
  });

  it('all themes use 5px spacing unit', () => {
    // MUI theme.spacing(1) should return '5px'
    expect(lightTheme.spacing(1)).toBe('5px');
    expect(darkTheme.spacing(1)).toBe('5px');
  });
});
