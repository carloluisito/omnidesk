import { useState } from 'react';
import type { GitFileEntry, GitFileArea } from '../../shared/types/git-types';

interface DiffFileNavProps {
  files: GitFileEntry[];
  activeFile: GitFileEntry | null;
  collapsed: boolean;
  onFileSelect: (file: GitFileEntry) => void;
}

interface SectionConfig {
  area: GitFileArea;
  title: string;
  color: string;
}

const SECTIONS: SectionConfig[] = [
  { area: 'staged', title: 'STAGED', color: 'var(--semantic-success, #3DD68C)' },
  { area: 'unstaged', title: 'UNSTAGED', color: 'var(--semantic-warning, #F7A84A)' },
  { area: 'untracked', title: 'UNTRACKED', color: 'var(--text-tertiary, #5C6080)' },
  { area: 'conflicted', title: 'CONFLICTS', color: 'var(--semantic-error, #F7678E)' },
];

export function DiffFileNav({ files, activeFile, collapsed, onFileSelect }: DiffFileNavProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<GitFileArea>>(new Set());

  if (collapsed) return null;

  const toggleSection = (area: GitFileArea) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  const statusChar = (file: GitFileEntry) => {
    const s = file.area === 'staged' ? file.indexStatus : file.workTreeStatus;
    switch (s) {
      case 'added': return 'A';
      case 'modified': return 'M';
      case 'deleted': return 'D';
      case 'renamed': return 'R';
      case 'untracked': return 'U';
      case 'unmerged': return '!';
      default: return '?';
    }
  };

  const statusColor = (file: GitFileEntry) => {
    const s = file.area === 'staged' ? file.indexStatus : file.workTreeStatus;
    switch (s) {
      case 'added': return 'var(--semantic-success, #3DD68C)';
      case 'modified': return 'var(--semantic-warning, #F7A84A)';
      case 'deleted': return 'var(--semantic-error, #F7678E)';
      case 'renamed': return 'var(--accent-primary, #00C9A7)';
      default: return 'var(--text-tertiary, #5C6080)';
    }
  };

  return (
    <div className="diff-file-nav">
      {SECTIONS.map(section => {
        const sectionFiles = files.filter(f => f.area === section.area);
        if (sectionFiles.length === 0) return null;
        const isCollapsed = collapsedSections.has(section.area);

        return (
          <div key={section.area} className="diff-nav-section">
            <div
              className="diff-nav-section-header"
              onClick={() => toggleSection(section.area)}
              style={{ borderLeftColor: section.color }}
            >
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-tertiary, #5C6080)" strokeWidth="2"
                style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span className="diff-nav-section-title">{section.title}</span>
              <span className="diff-nav-section-count">{sectionFiles.length}</span>
            </div>
            {!isCollapsed && sectionFiles.map(file => {
              const isActive = activeFile?.path === file.path && activeFile?.area === file.area;
              return (
                <div
                  key={`${file.area}-${file.path}`}
                  className={`diff-nav-file ${isActive ? 'active' : ''}`}
                  onClick={() => onFileSelect(file)}
                  title={file.path}
                >
                  <span className="diff-nav-file-name">
                    {file.path.split('/').pop() || file.path}
                  </span>
                  <span className="diff-nav-file-status" style={{ color: statusColor(file) }}>
                    {statusChar(file)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
