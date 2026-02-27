/**
 * Atlas Types — Repository Atlas Engine type definitions
 */

/** Supported programming languages for import extraction */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'css'
  | 'html'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'unknown';

/** Domain inference sensitivity level */
export type DomainSensitivity = 'low' | 'medium' | 'high';

/** Atlas output location */
export type AtlasOutputLocation = 'root' | 'docs';

/** Atlas settings persisted in ~/.omnidesk/settings.json */
export interface AtlasSettings {
  enableAtlas: boolean;
  maxInlineTags: number;
  domainInferenceSensitivity: DomainSensitivity;
  atlasOutputLocation: AtlasOutputLocation;
  excludePatterns: string[];
  scanTimeoutMs: number;
}

/** Info about a single source file discovered during scan */
export interface SourceFileInfo {
  relativePath: string;
  absolutePath: string;
  language: SupportedLanguage;
  lineCount: number;
  sizeBytes: number;
  imports: string[];
  exports: string[];
  layer: 'main' | 'renderer' | 'shared' | 'preload' | 'other';
}

/** A cross-file dependency edge */
export interface CrossDependency {
  from: string;
  to: string;
  importCount: number;
}

/** An inferred domain grouping */
export interface InferredDomain {
  name: string;
  files: SourceFileInfo[];
  ipcPrefix: string | null;
  mainFiles: string[];
  rendererFiles: string[];
  sharedFiles: string[];
  entrypoints: string[];
}

/** An inline @atlas-entrypoint tag candidate */
export interface InlineTag {
  filePath: string;
  relativePath: string;
  currentTag: string | null;
  suggestedTag: string;
  reason: string;
  selected: boolean;
}

/** Scan progress phases */
export type AtlasScanPhase =
  | 'enumerating'
  | 'analyzing'
  | 'inferring'
  | 'generating';

/** Progress event emitted during scan */
export interface AtlasScanProgress {
  phase: AtlasScanPhase;
  current: number;
  total: number;
  message: string;
}

/** Full scan result */
export interface AtlasScanResult {
  files: SourceFileInfo[];
  totalFiles: number;
  totalLines: number;
  languages: Record<SupportedLanguage, number>;
  dependencies: CrossDependency[];
  domains: InferredDomain[];
  inlineTags: InlineTag[];
  scanDurationMs: number;
}

/** Generated atlas content */
export interface AtlasGeneratedContent {
  claudeMd: string;
  repoIndex: string;
  inlineTags: InlineTag[];
  existingClaudeMd: string | null;
  existingRepoIndex: string | null;
}

/** Status of the atlas for the current project */
export interface AtlasStatus {
  hasAtlas: boolean;
  claudeMdPath: string | null;
  repoIndexPath: string | null;
  lastGenerated: number | null;
  inlineTagCount: number;
}

/** Request to generate atlas */
export interface AtlasGenerateRequest {
  projectPath: string;
  settings?: Partial<AtlasSettings>;
}

/** Result of generate operation */
export interface AtlasGenerateResult {
  scanResult: AtlasScanResult;
  generatedContent: AtlasGeneratedContent;
}

/** Request to write atlas files */
export interface AtlasWriteRequest {
  projectPath: string;
  claudeMd: string;
  repoIndex: string;
  inlineTags: InlineTag[];
}

/** Result of write operation */
export interface AtlasWriteResult {
  claudeMdWritten: boolean;
  repoIndexWritten: boolean;
  inlineTagsWritten: number;
}
