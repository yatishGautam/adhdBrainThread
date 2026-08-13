import { describe, expect, it } from 'vitest';
import { classifyLink, linkLabel, normaliseLink, notionDesktopUrl } from './links.js';

describe('classifyLink', () => {
  it('treats the notion scheme as notion', () => {
    expect(classifyLink('notion://www.notion.so/Page-abc123')).toBe('notion');
  });

  it('treats notion.so and notion.site pages as notion', () => {
    expect(classifyLink('https://www.notion.so/Page-abc123')).toBe('notion');
    expect(classifyLink('https://notion.so/Page-abc123')).toBe('notion');
    expect(classifyLink('https://myteam.notion.site/Page-abc123')).toBe('notion');
  });

  it('does not mistake a lookalike host for notion', () => {
    expect(classifyLink('https://notion.so.evil.example/page')).toBe('url');
    expect(classifyLink('https://fakenotion.so/page')).toBe('url');
  });

  it('treats anything else parseable as a plain url', () => {
    expect(classifyLink('https://example.com/thing')).toBe('url');
  });

  it('rejects empty and unparseable input', () => {
    expect(classifyLink('')).toBe('invalid');
    expect(classifyLink('   ')).toBe('invalid');
    expect(classifyLink('not a link')).toBe('invalid');
  });
});

describe('notionDesktopUrl', () => {
  it('rewrites a web notion link to the desktop scheme, keeping the path and hash', () => {
    expect(notionDesktopUrl('https://www.notion.so/Team/Page-abc?v=1#block')).toBe(
      'notion://www.notion.so/Team/Page-abc?v=1#block',
    );
  });

  it('passes an already-native link through unchanged', () => {
    expect(notionDesktopUrl('notion://www.notion.so/Page-abc')).toBe(
      'notion://www.notion.so/Page-abc',
    );
  });

  it('has nothing to try for a non-notion url', () => {
    expect(notionDesktopUrl('https://example.com')).toBeNull();
  });
});

describe('normaliseLink', () => {
  it('adds https to a bare host so a pasted link still opens', () => {
    expect(normaliseLink('notion.so/Page-abc')).toBe('https://notion.so/Page-abc');
  });

  it('leaves an existing scheme alone', () => {
    expect(normaliseLink('notion://x')).toBe('notion://x');
    expect(normaliseLink('http://example.com')).toBe('http://example.com');
  });
});

describe('linkLabel', () => {
  it('labels notion links "Notion" and others by host', () => {
    expect(linkLabel('https://www.notion.so/Page-abc')).toBe('Notion');
    expect(linkLabel('notion://www.notion.so/Page-abc')).toBe('Notion');
    expect(linkLabel('https://www.github.com/x/y')).toBe('github.com');
  });
});
