import { describe, it, expect } from 'vitest';
import { decodeEntities } from '../csv-parser';

describe('decodeEntities', () => {
  it('decodes numeric HTML entity for apostrophe (&#39;)', () => {
    expect(decodeEntities("I&#39;m learning")).toBe("I'm learning");
  });

  it('decodes named HTML entity for apostrophe (&apos;)', () => {
    expect(decodeEntities("it&apos;s great")).toBe("it's great");
  });

  it('decodes &amp; to &', () => {
    expect(decodeEntities("A &amp; B")).toBe("A & B");
  });

  it('decodes &quot; to double quote', () => {
    expect(decodeEntities('She said &quot;hello&quot;')).toBe('She said "hello"');
  });

  it('decodes &lt; and &gt; to angle brackets', () => {
    expect(decodeEntities("&lt;div&gt;")).toBe("<div>");
  });

  it('passes through text with no entities unchanged', () => {
    expect(decodeEntities("No entities here")).toBe("No entities here");
  });

  it('handles multiple different entities in one string', () => {
    expect(decodeEntities("I&#39;m &amp; you&apos;re &lt;here&gt;"))
      .toBe("I'm & you're <here>");
  });

  it('handles empty string', () => {
    expect(decodeEntities("")).toBe("");
  });
});
