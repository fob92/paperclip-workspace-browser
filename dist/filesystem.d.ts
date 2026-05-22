export declare const WORKSPACE_LIMITS: {
    previewTextBytes: number;
    previewImageBytes: number;
    previewPdfBytes: number;
    contentSearchBytes: number;
    searchResults: number;
    zipInputBytes: number;
    downloadFileBytes: number;
};
export type SearchMode = "path" | "content" | "both";
export interface WorkspaceFileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isSymlink: boolean;
    sizeBytes: number | null;
    extension: string | null;
}
export interface FilePreview {
    path: string;
    name: string;
    kind: "directory" | "markdown" | "code" | "text" | "image" | "pdf" | "binary";
    mimeType: string | null;
    sizeBytes: number;
    truncated: boolean;
    content: string | null;
    previewDataUrl: string | null;
    language: string | null;
}
export interface WorkspaceSearchHit {
    path: string;
    isDirectory: boolean;
    matchedBy: "path" | "content" | "both";
    snippet: string | null;
}
export interface DownloadPayload {
    fileName: string;
    mimeType: string;
    base64: string;
    byteLength: number;
}
export interface ZipPayload extends DownloadPayload {
    includedPaths: string[];
}
export declare function looksLikePath(value: string): boolean;
export declare function sanitizeWorkspacePath(pathValue: string): string;
export declare function workspaceLabel(workspace: {
    name: string;
    path: string;
    isPrimary: boolean;
}): string;
export declare function resolveWorkspacePath(workspacePath: string, requestedPath?: string): string | null;
export declare function listDirectory(workspacePath: string, directoryPath?: string): Promise<WorkspaceFileEntry[]>;
export declare function readFilePreview(workspacePath: string, filePath: string): Promise<FilePreview>;
export declare function searchWorkspace(workspacePath: string, query: string, mode?: SearchMode): Promise<{
    results: WorkspaceSearchHit[];
    truncated: boolean;
}>;
export declare function buildFileDownload(workspacePath: string, filePath: string): Promise<DownloadPayload>;
export declare function buildZipDownload(workspacePath: string, relativePaths: string[], archiveBaseName: string): Promise<ZipPayload>;
export declare function buildTerminalCommand(workspacePath: string, targetPath?: string): Promise<string>;
