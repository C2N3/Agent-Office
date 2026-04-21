import React, { type ReactElement } from 'react';

export type DiffLineType = 'add' | 'ctx' | 'del' | 'hunk';

export type DiffLine = {
  text: string;
  type: DiffLineType;
};

export type DiffFile = {
  additions: number;
  deletions: number;
  lines: DiffLine[];
  name: string;
};

export function parseDiffToFiles(diff: string): DiffFile[] {
  if (!diff) return [];

  const files: DiffFile[] = [];
  const lines = diff.split('\n');
  let current: DiffFile | null = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      current = {
        additions: 0,
        deletions: 0,
        lines: [],
        name: match ? match[2] : 'unknown',
      };
      continue;
    }

    if (!current) continue;
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    if (line.startsWith('@@')) {
      current.lines.push({ type: 'hunk', text: line });
    } else if (line.startsWith('+')) {
      current.additions += 1;
      current.lines.push({ type: 'add', text: line });
    } else if (line.startsWith('-')) {
      current.deletions += 1;
      current.lines.push({ type: 'del', text: line });
    } else {
      current.lines.push({ type: 'ctx', text: line });
    }
  }

  if (current) files.push(current);
  return files;
}

function lineClassName(type: DiffLineType): string {
  if (type === 'add') return 'diff-line-add';
  if (type === 'del') return 'diff-line-del';
  if (type === 'hunk') return 'diff-line-hunk';
  return 'diff-line-ctx';
}

type DiffFileListProps = {
  files: DiffFile[];
};

export function DiffFileList({ files }: DiffFileListProps): ReactElement {
  if (!files.length) {
    return <div className="diff-empty">(no changes)</div>;
  }

  return (
    <>
      {files.map((file) => (
        <details className="diff-file" key={file.name}>
          <summary className="diff-file-header">
            <span className="diff-file-name">{file.name}</span>
            <span className="diff-stat-add">+{file.additions}</span>
            <span className="diff-stat-del">-{file.deletions}</span>
          </summary>
          <div className="diff-file-body">
            {file.lines.map((line, index) => (
              <div className={lineClassName(line.type)} key={`${line.type}-${index}`}>
                {line.text}
              </div>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
