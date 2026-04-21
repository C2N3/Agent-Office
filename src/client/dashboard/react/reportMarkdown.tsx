import React, { type ReactElement } from 'react';

type MarkdownBlockProps = {
  className?: string;
  fallback?: string;
  markdown: string;
};

function parseMarkdown(markdown: string): string | null {
  const markedLib = (globalThis as any).marked;
  if (!markedLib?.parse) return null;
  return String(markedLib.parse(markdown));
}

export function MarkdownBlock({
  className = 'task-report-md',
  fallback = '',
  markdown,
}: MarkdownBlockProps): ReactElement {
  const content = markdown || fallback;
  const html = parseMarkdown(content);

  if (html != null) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <div className={className}>{content}</div>;
}
