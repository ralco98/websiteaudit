import { SelectorMetadata } from './types.js';

/**
 * Deterministic Stable Selector Generator (§15)
 * Generates reliable CSS selectors avoiding brittle nth-child paths.
 */
export function generateStableSelector(elementData: {
  id?: string | null;
  name?: string | null;
  tagName: string;
  className?: string | null;
  attributes?: Record<string, string>;
  parentTag?: string | null;
}): SelectorMetadata {
  const tag = elementData.tagName.toLowerCase();

  // Level 1: ID attribute (HIGH stability)
  if (elementData.id && typeof elementData.id === 'string' && /^[a-zA-Z][\w-]*$/.test(elementData.id)) {
    return {
      selector: `#${elementData.id}`,
      stability: 'HIGH',
    };
  }

  // Level 2: Unique Data Attributes (HIGH stability)
  if (elementData.attributes) {
    for (const [key, val] of Object.entries(elementData.attributes)) {
      if (key.startsWith('data-testid') || key.startsWith('data-qa') || key.startsWith('data-cy')) {
        return {
          selector: `[${key}="${val}"]`,
          stability: 'HIGH',
        };
      }
    }
  }

  // Level 3: Form Input Name or ARIA Label (MEDIUM stability)
  if (elementData.name && typeof elementData.name === 'string' && /^[a-zA-Z][\w-]*$/.test(elementData.name)) {
    return {
      selector: `${tag}[name="${elementData.name}"]`,
      stability: 'MEDIUM',
    };
  }

  if (elementData.attributes?.['aria-label']) {
    return {
      selector: `${tag}[aria-label="${elementData.attributes['aria-label']}"]`,
      stability: 'MEDIUM',
    };
  }

  // Level 4: Semantic classes (MEDIUM stability)
  if (elementData.className && typeof elementData.className === 'string') {
    const classes = elementData.className
      .split(/\s+/)
      .filter(c => c && !c.includes(':') && !c.startsWith('hover') && c.length < 30)
      .slice(0, 2);
    if (classes.length > 0) {
      const classSelector = `${tag}.${classes.join('.')}`;
      return {
        selector: classSelector,
        stability: 'MEDIUM',
      };
    }
  }

  // Level 5: Parent-Scoped Fallback Path (LOW stability)
  const parent = elementData.parentTag ? `${elementData.parentTag.toLowerCase()} > ` : '';
  return {
    selector: `${parent}${tag}`,
    stability: 'LOW',
  };
}
