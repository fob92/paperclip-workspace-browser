import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

export const WORKSPACE_LIMITS = {
  previewTextBytes: 512 * 1024,
  previewImageBytes: 4 * 1024 * 1024,
  previewPdfBytes: 12 * 1024 * 1024,
  contentSearchBytes: 256 * 1024,
  searchResults: 200,
  zipInputBytes: 64 * 1024 * 1024,
  downloadFileBytes: 16 * 1024 * 1024,
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

const PATH_LIKE_PATTERN = /[\\/]/;
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".env",
  ".go",
  ".graphql",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".mjs",
  ".md",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);
const MARKDOWN_EXTENSIONS = new Set([".markdown", ".md", ".mdx"]);
const IMAGE_MIME_TYPES = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const PDF_MIME_TYPE = "application/pdf";
const SEARCH_IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
]);
const CODE_EXTENSIONS = new Set([
  ".astro",
  ".bash",
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".go",
  ".graphql",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".css": "css",
  ".go": "go",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "jsx",
  ".md": "markdown",
  ".py": "python",
  ".rs": "rust",
  ".sh": "bash",
  ".sql": "sql",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
};

export function looksLikePath(value: string): boolean {
  const normalized = value.trim();
  return (PATH_LIKE_PATTERN.test(normalized) || WINDOWS_DRIVE_PATH_PATTERN.test(normalized))
    && !UUID_PATTERN.test(normalized);
}

export function sanitizeWorkspacePath(pathValue: string): string {
  return looksLikePath(pathValue) ? pathValue.trim() : "";
}

export function workspaceLabel(workspace: { name: string; path: string; isPrimary: boolean }): string {
  const safePath = sanitizeWorkspacePath(workspace.path);
  const safeName = workspace.name.trim();
  const base = safePath || (safeName && !UUID_PATTERN.test(safeName) ? safeName : "(no workspace path)");
  return workspace.isPrimary ? `${base} (primary)` : base;
}

export function resolveWorkspacePath(workspacePath: string, requestedPath = ""): string | null {
  const root = path.resolve(workspacePath);
  const resolved = requestedPath ? path.resolve(root, requestedPath) : root;
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.trim().replaceAll("\\", "/");
  if (!normalized || normalized === ".") return "";
  return path.posix.normalize(normalized);
}

function extensionFor(fileName: string): string | null {
  const extension = path.extname(fileName).toLowerCase();
  return extension || null;
}

function isTextExtension(extension: string | null): boolean {
  return extension ? TEXT_EXTENSIONS.has(extension) : false;
}

function isCodeExtension(extension: string | null): boolean {
  return extension ? CODE_EXTENSIONS.has(extension) : false;
}

function isMarkdownExtension(extension: string | null): boolean {
  return extension ? MARKDOWN_EXTENSIONS.has(extension) : false;
}

function imageMimeType(extension: string | null): string | null {
  return extension ? IMAGE_MIME_TYPES.get(extension) ?? null : null;
}

function languageFor(extension: string | null): string | null {
  return extension ? LANGUAGE_BY_EXTENSION[extension] ?? null : null;
}

function textSnippet(content: string, query: string): string | null {
  const queryLower = query.toLowerCase();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const matchIndex = line.toLowerCase().indexOf(queryLower);
    if (matchIndex === -1) continue;
    const start = Math.max(0, matchIndex - 48);
    const end = Math.min(line.length, matchIndex + query.length + 72);
    return line.slice(start, end).trim() || line.trim();
  }
  return null;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const probeLength = Math.min(buffer.length, 1024);
  for (let index = 0; index < probeLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

async function resolveExistingEntry(workspacePath: string, requestedPath = "") {
  const safeWorkspacePath = sanitizeWorkspacePath(workspacePath);
  if (!safeWorkspacePath) {
    throw new Error("Workspace has no local filesystem path");
  }

  const root = path.resolve(safeWorkspacePath);
  const requested = normalizeRelativePath(requestedPath);
  const candidate = resolveWorkspacePath(root, requested);
  if (!candidate) {
    throw new Error("Path escapes workspace");
  }

  const stat = await fs.lstat(candidate);
  if (stat.isSymbolicLink()) {
    const realPath = await fs.realpath(candidate);
    const relative = path.relative(root, realPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Symlink escapes workspace");
    }
    const realStat = await fs.stat(realPath);
    return { root, entryPath: candidate, realPath, relativePath: requested, stat: realStat, isSymlink: true };
  }

  return { root, entryPath: candidate, realPath: candidate, relativePath: requested, stat, isSymlink: false };
}

export async function listDirectory(workspacePath: string, directoryPath = ""): Promise<WorkspaceFileEntry[]> {
  const target = await resolveExistingEntry(workspacePath, directoryPath);
  if (!target.stat.isDirectory()) {
    throw new Error("Selected path is not a directory");
  }

  const entries = await fs.readdir(target.realPath, { withFileTypes: true });
  const items = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(target.realPath, entry.name);
    const entryStat = await fs.lstat(fullPath);
    const relativePath = normalizeRelativePath(path.relative(target.root, fullPath));
    const isSymlink = entryStat.isSymbolicLink();
    let isDirectory = entry.isDirectory();
    let sizeBytes: number | null = isDirectory ? null : entryStat.size;

    if (isSymlink) {
      try {
        const realPath = await fs.realpath(fullPath);
        const relative = path.relative(target.root, realPath);
        if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
          const realStat = await fs.stat(realPath);
          isDirectory = realStat.isDirectory();
          sizeBytes = isDirectory ? null : realStat.size;
        }
      } catch {
        sizeBytes = null;
      }
    }

    return {
      name: entry.name,
      path: relativePath,
      isDirectory,
      isSymlink,
      sizeBytes,
      extension: isDirectory ? null : extensionFor(entry.name),
    };
  }));

  return items.sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

async function readLeadingBuffer(filePath: string, limit: number) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function readFilePreview(workspacePath: string, filePath: string): Promise<FilePreview> {
  const target = await resolveExistingEntry(workspacePath, filePath);
  const fileName = path.basename(target.realPath);
  const extension = extensionFor(fileName);

  if (target.stat.isDirectory()) {
    return {
      path: normalizeRelativePath(filePath),
      name: fileName,
      kind: "directory",
      mimeType: null,
      sizeBytes: 0,
      truncated: false,
      content: null,
      previewDataUrl: null,
      language: null,
    };
  }

  const sizeBytes = target.stat.size;
  const isPdf = extension === ".pdf";
  const imageType = imageMimeType(extension);
  if (imageType) {
    if (sizeBytes > WORKSPACE_LIMITS.previewImageBytes) {
      return {
        path: normalizeRelativePath(filePath),
        name: fileName,
        kind: "image",
        mimeType: imageType,
        sizeBytes,
        truncated: true,
        content: null,
        previewDataUrl: null,
        language: null,
      };
    }
    const buffer = await fs.readFile(target.realPath);
    return {
      path: normalizeRelativePath(filePath),
      name: fileName,
      kind: "image",
      mimeType: imageType,
      sizeBytes,
      truncated: false,
      content: null,
      previewDataUrl: `data:${imageType};base64,${buffer.toString("base64")}`,
      language: null,
    };
  }

  if (isPdf) {
    if (sizeBytes > WORKSPACE_LIMITS.previewPdfBytes) {
      return {
        path: normalizeRelativePath(filePath),
        name: fileName,
        kind: "pdf",
        mimeType: PDF_MIME_TYPE,
        sizeBytes,
        truncated: true,
        content: null,
        previewDataUrl: null,
        language: null,
      };
    }
    const buffer = await fs.readFile(target.realPath);
    return {
      path: normalizeRelativePath(filePath),
      name: fileName,
      kind: "pdf",
      mimeType: PDF_MIME_TYPE,
      sizeBytes,
      truncated: false,
      content: null,
      previewDataUrl: `data:${PDF_MIME_TYPE};base64,${buffer.toString("base64")}`,
      language: null,
    };
  }

  const previewBytes = Math.min(sizeBytes, WORKSPACE_LIMITS.previewTextBytes);
  const buffer = await readLeadingBuffer(target.realPath, previewBytes);
  if (isBinaryBuffer(buffer) || (!isTextExtension(extension) && !buffer.toString("utf8"))) {
    return {
      path: normalizeRelativePath(filePath),
      name: fileName,
      kind: "binary",
      mimeType: "application/octet-stream",
      sizeBytes,
      truncated: false,
      content: null,
      previewDataUrl: null,
      language: null,
    };
  }

  const content = buffer.toString("utf8");
  return {
    path: normalizeRelativePath(filePath),
    name: fileName,
    kind: isMarkdownExtension(extension) ? "markdown" : isCodeExtension(extension) ? "code" : "text",
    mimeType: "text/plain; charset=utf-8",
    sizeBytes,
    truncated: sizeBytes > WORKSPACE_LIMITS.previewTextBytes,
    content,
    previewDataUrl: null,
    language: languageFor(extension),
  };
}

export async function searchWorkspace(
  workspacePath: string,
  query: string,
  mode: SearchMode = "both",
): Promise<{ results: WorkspaceSearchHit[]; truncated: boolean }> {
  const safeWorkspacePath = sanitizeWorkspacePath(workspacePath);
  if (!safeWorkspacePath) {
    throw new Error("Workspace has no local filesystem path");
  }

  const queryLower = query.trim().toLowerCase();
  if (!queryLower) return { results: [], truncated: false };

  const root = path.resolve(safeWorkspacePath);
  const results: WorkspaceSearchHit[] = [];
  let truncated = false;

  async function walk(currentAbsolutePath: string, currentRelativePath = ""): Promise<void> {
    if (truncated) return;
    const stat = await fs.lstat(currentAbsolutePath);
    const isDirectory = stat.isDirectory();
    const fileName = path.basename(currentAbsolutePath);
    const normalizedRelative = normalizeRelativePath(currentRelativePath);
    const pathMatch = normalizedRelative.toLowerCase().includes(queryLower) || fileName.toLowerCase().includes(queryLower);

    if (normalizedRelative && pathMatch) {
      results.push({
        path: normalizedRelative,
        isDirectory,
        matchedBy: "path",
        snippet: null,
      });
    }

    if (results.length >= WORKSPACE_LIMITS.searchResults) {
      truncated = true;
      return;
    }

    if (isDirectory) {
      const entries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
      for (const entry of entries) {
        if (truncated) return;
        if (entry.isDirectory() && SEARCH_IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
        const nextRelative = normalizeRelativePath(path.join(currentRelativePath, entry.name));
        await walk(path.join(currentAbsolutePath, entry.name), nextRelative);
      }
      return;
    }

    if (mode === "path") return;
    if (stat.size > WORKSPACE_LIMITS.contentSearchBytes) return;

    const extension = extensionFor(fileName);
    if (!isTextExtension(extension)) return;

    const buffer = await fs.readFile(currentAbsolutePath);
    if (isBinaryBuffer(buffer)) return;
    const content = buffer.toString("utf8");
    if (!content.toLowerCase().includes(queryLower)) return;

    const existing = results.find((result) => result.path === normalizedRelative);
    const snippet = textSnippet(content, queryLower);
    if (existing) {
      existing.matchedBy = "both";
      existing.snippet = existing.snippet ?? snippet;
      return;
    }

    results.push({
      path: normalizedRelative,
      isDirectory: false,
      matchedBy: "content",
      snippet,
    });
    if (results.length >= WORKSPACE_LIMITS.searchResults) {
      truncated = true;
    }
  }

  await walk(root, "");
  return { results, truncated };
}

export async function buildFileDownload(workspacePath: string, filePath: string): Promise<DownloadPayload> {
  const target = await resolveExistingEntry(workspacePath, filePath);
  if (target.stat.isDirectory()) {
    throw new Error("Selected path is a directory");
  }
  if (target.stat.size > WORKSPACE_LIMITS.downloadFileBytes) {
    throw new Error("File is too large for direct download");
  }

  const buffer = await fs.readFile(target.realPath);
  const extension = extensionFor(target.realPath);
  return {
    fileName: path.basename(target.realPath),
    mimeType: imageMimeType(extension) ?? (isTextExtension(extension) ? "text/plain; charset=utf-8" : "application/octet-stream"),
    base64: buffer.toString("base64"),
    byteLength: buffer.byteLength,
  };
}

async function addZipEntry(
  zip: JSZip,
  workspaceRoot: string,
  inputPath: string,
  zipBasePath: string,
  budget: { bytes: number },
  includedPaths: string[],
) {
  const target = await resolveExistingEntry(workspaceRoot, inputPath);
  const zipPath = normalizeRelativePath(zipBasePath || inputPath);

  if (target.stat.isDirectory()) {
    if (zipPath) {
      zip.folder(zipPath);
      includedPaths.push(zipPath);
    }
    const entries = await fs.readdir(target.realPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryRelativePath = normalizeRelativePath(path.join(inputPath, entry.name));
      await addZipEntry(zip, workspaceRoot, entryRelativePath, entryRelativePath, budget, includedPaths);
    }
    return;
  }

  budget.bytes += target.stat.size;
  if (budget.bytes > WORKSPACE_LIMITS.zipInputBytes) {
    throw new Error("ZIP export exceeds the configured safety limit");
  }

  const buffer = await fs.readFile(target.realPath);
  zip.file(zipPath, buffer);
  includedPaths.push(zipPath);
}

export async function buildZipDownload(
  workspacePath: string,
  relativePaths: string[],
  archiveBaseName: string,
): Promise<ZipPayload> {
  const zip = new JSZip();
  const includedPaths: string[] = [];
  const budget = { bytes: 0 };
  const targets = relativePaths.length > 0 ? relativePaths : [""];

  for (const targetPath of targets) {
    await addZipEntry(zip, workspacePath, targetPath, targetPath, budget, includedPaths);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    fileName: `${archiveBaseName}.zip`,
    mimeType: "application/zip",
    base64: buffer.toString("base64"),
    byteLength: buffer.byteLength,
    includedPaths,
  };
}

export async function buildTerminalCommand(workspacePath: string, targetPath?: string): Promise<string> {
  const selectedPath = targetPath ? await resolveExistingEntry(workspacePath, targetPath) : null;
  const workingDirectory = selectedPath
    ? selectedPath.stat.isDirectory() ? selectedPath.realPath : path.dirname(selectedPath.realPath)
    : path.resolve(sanitizeWorkspacePath(workspacePath));
  return `cd '${workingDirectory.replaceAll("'", "'\\''")}'`;
}
