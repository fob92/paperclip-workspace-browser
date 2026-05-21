import type { PluginDetailTabProps, PluginProjectSidebarItemProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

const PLUGIN_KEY = "paperclip-workspace-browser";
const PROJECT_TAB_SLOT_ID = "workspace-browser-project-tab";

type WorkspaceRecord = {
  id: string;
  projectId: string;
  name: string;
  path: string;
  label: string;
  isPrimary: boolean;
};

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  sizeBytes: number | null;
  extension: string | null;
};

type PreviewRecord = {
  path: string;
  name: string;
  kind: "directory" | "markdown" | "code" | "text" | "image" | "binary";
  mimeType: string | null;
  sizeBytes: number;
  truncated: boolean;
  content: string | null;
  imageDataUrl: string | null;
  language: string | null;
} | null;

type SearchHit = {
  path: string;
  isDirectory: boolean;
  matchedBy: "path" | "content" | "both";
  snippet: string | null;
};

type SearchResponse = {
  results: SearchHit[];
  truncated: boolean;
};

type DownloadPayload = {
  fileName: string;
  mimeType: string;
  base64: string;
  byteLength: number;
};

type TreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: TreeNode[];
};

type FileTreePanelProps = {
  checkedPaths: Set<string>;
  emptyDescription: string;
  emptyTitle: string;
  error: string | null;
  expandedPaths: Set<string>;
  loading: boolean;
  nodes: TreeNode[];
  onSelectFile: (path: string) => void;
  onToggleCheck: (path: string) => void;
  onToggleDir: (path: string) => void;
  selectedFile: string | null;
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--card, transparent) 92%, transparent)",
  overflow: "hidden",
};

const sectionStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: "12px",
  padding: "16px",
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--muted-foreground)",
  lineHeight: 1.45,
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "7px 12px",
  fontSize: "12px",
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  background: "transparent",
  color: "inherit",
  padding: "10px 12px",
  fontSize: "13px",
};

const codeBlockStyle: CSSProperties = {
  margin: 0,
  padding: "16px",
  borderTop: "1px solid var(--border)",
  fontSize: "12px",
  lineHeight: 1.55,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  overflow: "auto",
  background: "color-mix(in srgb, var(--muted, #888) 10%, transparent)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const previewTextStyle: CSSProperties = {
  ...codeBlockStyle,
  fontFamily: "inherit",
};

function buildProjectTabValue() {
  return `plugin:${PLUGIN_KEY}:${PROJECT_TAB_SLOT_ID}`;
}

function buildProjectWorkspaceHref(
  companyPrefix: string | null | undefined,
  projectRef: string,
) {
  const prefix = companyPrefix ? `/${companyPrefix}` : "";
  const tabValue = buildProjectTabValue();
  return `${prefix}/projects/${projectRef}?tab=${encodeURIComponent(tabValue)}`;
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.altKey
    && !event.ctrlKey
    && !event.shiftKey
  );
}

function formatBytes(value: number | null): string {
  if (value == null) return "folder";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTreeNodes(entries: FileEntry[]): TreeNode[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.isDirectory ? "dir" : "file",
    children: [],
  }));
}

function setChildrenAtPath(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children };
    }
    if (node.kind === "dir" && node.children.length > 0 && targetPath.startsWith(`${node.path}/`)) {
      return { ...node, children: setChildrenAtPath(node.children, targetPath, children) };
    }
    return node;
  });
}

function parentDirectory(filePath: string | null) {
  if (!filePath) return null;
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function fileDisplayName(filePath: string | null) {
  if (!filePath) return "No file selected";
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function triggerDownload(payload: DownloadPayload) {
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function FileTreePanel({
  checkedPaths,
  emptyDescription,
  emptyTitle,
  error,
  expandedPaths,
  loading,
  nodes,
  onSelectFile,
  onToggleCheck,
  onToggleDir,
  selectedFile,
}: FileTreePanelProps) {
  function renderNodes(currentNodes: TreeNode[], depth = 0) {
    return currentNodes.map((node) => {
      const isDirectory = node.kind === "dir";
      const isExpanded = expandedPaths.has(node.path);
      const isChecked = checkedPaths.has(node.path);
      const isSelected = !isDirectory && selectedFile === node.path;

      return (
        <div key={node.path} style={{ display: "grid", gap: "6px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "20px 18px minmax(0, 1fr)",
              gap: "8px",
              alignItems: "center",
              paddingLeft: `${depth * 14}px`,
            }}
          >
            <button
              type="button"
              aria-label={isDirectory ? (isExpanded ? "Collapse folder" : "Expand folder") : "File"}
              onClick={() => {
                if (isDirectory) onToggleDir(node.path);
              }}
              style={{
                ...buttonStyle,
                padding: "0",
                width: "20px",
                height: "20px",
                borderRadius: "8px",
                fontSize: "11px",
                cursor: isDirectory ? "pointer" : "default",
                opacity: isDirectory ? 1 : 0.45,
              }}
              disabled={!isDirectory}
            >
              {isDirectory ? (isExpanded ? "−" : "+") : "•"}
            </button>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleCheck(node.path)}
              aria-label={`Select ${node.path}`}
            />
            <button
              type="button"
              onClick={() => {
                if (isDirectory) onToggleDir(node.path);
                else onSelectFile(node.path);
              }}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "12px",
                background: isSelected ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
                color: "inherit",
                cursor: "pointer",
                padding: "8px 10px",
                textAlign: "left",
                width: "100%",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  {node.name}
                </span>
                <span style={mutedTextStyle}>{isDirectory ? "dir" : "file"}</span>
              </div>
            </button>
          </div>
          {isDirectory && isExpanded && node.children.length > 0 ? (
            <div style={{ display: "grid", gap: "6px" }}>{renderNodes(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  }

  if (loading) {
    return <div style={mutedTextStyle}>Loading files…</div>;
  }

  if (error) {
    return <div style={mutedTextStyle}>{error}</div>;
  }

  if (nodes.length === 0) {
    return (
      <div style={{ display: "grid", gap: "4px" }}>
        <strong>{emptyTitle}</strong>
        <div style={mutedTextStyle}>{emptyDescription}</div>
      </div>
    );
  }

  return <div style={{ display: "grid", gap: "6px" }}>{renderNodes(nodes)}</div>;
}

export function WorkspaceProjectFilesLink({ context }: PluginProjectSidebarItemProps) {
  const projectId = context.entityId;
  const projectRef = (context as PluginProjectSidebarItemProps["context"] & { projectRef?: string | null })
    .projectRef
    ?? projectId;
  const href = buildProjectWorkspaceHref(context.companyPrefix, projectRef);
  const tabValue = buildProjectTabValue();
  const isActive = typeof window !== "undefined" && (() => {
    const pathname = window.location.pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    const projectsIndex = segments.indexOf("projects");
    const activeProjectRef = projectsIndex >= 0 ? segments[projectsIndex + 1] ?? null : null;
    const activeTab = new URLSearchParams(window.location.search).get("tab");
    if (activeTab !== tabValue) return false;
    if (!activeProjectRef) return false;
    return activeProjectRef === projectId || activeProjectRef === projectRef;
  })();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={`block px-3 py-1 text-[12px] truncate transition-colors ${
        isActive
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      Workspace Files
    </a>
  );
}

export function WorkspaceBrowserTab({ context }: PluginDetailTabProps) {
  const toast = usePluginToast();
  const projectId = context.entityId;
  const companyId = context.companyId;
  const isCompactLayout = useMediaQuery("(max-width: 1080px)");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(() => new Set());
  const [searchInput, setSearchInput] = useState("");
  const deferredSearchInput = useDeferredValue(searchInput.trim());
  const [searchState, setSearchState] = useState<{
    loading: boolean;
    error: string | null;
    results: SearchHit[];
    truncated: boolean;
  }>({
    loading: false,
    error: null,
    results: [],
    truncated: false,
  });

  const workspacesResult = usePluginData<WorkspaceRecord[]>("project-workspaces", {
    companyId,
    projectId,
  });
  const workspaces = workspacesResult.data ?? [];

  const effectiveWorkspace = useMemo(() => {
    if (workspaces.length === 0) return null;
    return workspaces.find((workspace) => workspace.id === workspaceId)
      ?? workspaces.find((workspace) => workspace.isPrimary)
      ?? workspaces[0]
      ?? null;
  }, [workspaceId, workspaces]);

  useEffect(() => {
    if (!effectiveWorkspace) return;
    if (workspaceId === effectiveWorkspace.id) return;
    setWorkspaceId(effectiveWorkspace.id);
  }, [effectiveWorkspace, workspaceId]);

  const rootFileList = usePluginData<{ entries: FileEntry[] }>("file-list", {
    companyId,
    projectId,
    workspaceId: effectiveWorkspace?.id ?? "",
    directoryPath: "",
  });

  const filePreview = usePluginData<PreviewRecord>("file-preview", {
    companyId,
    projectId,
    workspaceId: effectiveWorkspace?.id ?? "",
    filePath: selectedFile ?? "",
  });

  const loadFileList = usePluginAction("load-file-list");
  const searchWorkspace = usePluginAction("search-workspace");
  const downloadFile = usePluginAction("download-file");
  const downloadZip = usePluginAction("download-zip");
  const terminalCommand = usePluginAction("terminal-command");

  useEffect(() => {
    setNodes(rootFileList.data?.entries ? fileTreeNodes(rootFileList.data.entries) : []);
  }, [rootFileList.data]);

  useEffect(() => {
    setExpandedPaths(new Set());
    setLoadedDirs(new Set());
    setLoadingDirs(new Set());
    setCheckedPaths(new Set());
    setSelectedFile(null);
    setSearchInput("");
    setSearchState({
      loading: false,
      error: null,
      results: [],
      truncated: false,
    });
  }, [effectiveWorkspace?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !effectiveWorkspace?.id || deferredSearchInput.length < 2) {
      setSearchState({
        loading: false,
        error: null,
        results: [],
        truncated: false,
      });
      return;
    }

    setSearchState((current) => ({ ...current, loading: true, error: null }));
    void searchWorkspace({
      companyId,
      projectId,
      workspaceId: effectiveWorkspace.id,
      query: deferredSearchInput,
      mode: "both",
    })
      .then((response) => {
        if (cancelled) return;
        const payload = response as SearchResponse;
        setSearchState({
          loading: false,
          error: null,
          results: payload.results ?? [],
          truncated: payload.truncated ?? false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          results: [],
          truncated: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, deferredSearchInput, effectiveWorkspace?.id, projectId, searchWorkspace]);

  useEffect(() => {
    let cancelled = false;

    async function ensurePathLoaded() {
      if (!selectedFile || !projectId || !effectiveWorkspace?.id) return;
      const directory = parentDirectory(selectedFile);
      if (directory == null) return;

      const segments = directory.split("/").filter(Boolean);
      let currentPath = "";
      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        setExpandedPaths((current) => new Set(current).add(currentPath));
        if (loadedDirs.has(currentPath)) continue;
        const response = await loadFileList({
          companyId,
          projectId,
          workspaceId: effectiveWorkspace.id,
          directoryPath: currentPath,
        }) as { entries?: FileEntry[] };
        if (cancelled) return;
        setNodes((current) => setChildrenAtPath(current, currentPath, fileTreeNodes(response.entries ?? [])));
        setLoadedDirs((current) => new Set(current).add(currentPath));
      }
    }

    void ensurePathLoaded();
    return () => {
      cancelled = true;
    };
  }, [companyId, effectiveWorkspace?.id, loadFileList, loadedDirs, projectId, selectedFile]);

  async function handleToggleDir(dirPath: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });

    if (!projectId || !effectiveWorkspace?.id) return;
    if (loadedDirs.has(dirPath) || loadingDirs.has(dirPath)) return;

    setLoadingDirs((current) => new Set(current).add(dirPath));
    try {
      const response = await loadFileList({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        directoryPath: dirPath,
      }) as { entries?: FileEntry[] };
      setNodes((current) => setChildrenAtPath(current, dirPath, fileTreeNodes(response.entries ?? [])));
      setLoadedDirs((current) => new Set(current).add(dirPath));
    } catch (error) {
      toast({
        title: "Directory load failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setLoadingDirs((current) => {
        const next = new Set(current);
        next.delete(dirPath);
        return next;
      });
    }
  }

  function handleToggleCheck(targetPath: string) {
    setCheckedPaths((current) => {
      const next = new Set(current);
      if (next.has(targetPath)) next.delete(targetPath);
      else next.add(targetPath);
      return next;
    });
  }

  async function handleDownloadSelected() {
    if (!projectId || !effectiveWorkspace?.id) return;
    try {
      const response = await downloadZip({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        paths: [...checkedPaths],
        archiveBaseName: checkedPaths.size > 0 ? "workspace-selection" : "workspace-files",
      }) as DownloadPayload;
      triggerDownload(response);
      toast({
        title: "ZIP ready",
        body: response.fileName,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "ZIP export failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    }
  }

  async function handleDownloadFile(filePath: string | null) {
    if (!projectId || !effectiveWorkspace?.id || !filePath) return;
    try {
      const response = await downloadFile({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        filePath,
      }) as DownloadPayload;
      triggerDownload(response);
    } catch (error) {
      toast({
        title: "Download failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    }
  }

  async function handleCopyTerminalCommand(targetPath: string | null) {
    if (!projectId || !effectiveWorkspace?.id) return;
    try {
      const response = await terminalCommand({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        targetPath: targetPath ?? "",
      }) as { command: string };
      await copyToClipboard(response.command);
      toast({
        title: "Terminal command copied",
        body: response.command,
        tone: "info",
      });
    } catch (error) {
      toast({
        title: "Terminal command failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    }
  }

  return (
    <main
      style={{
        display: "grid",
        gap: "16px",
        padding: isCompactLayout ? "14px" : "18px",
        color: "inherit",
        width: "100%",
      }}
    >
      <section
        style={{
          ...cardStyle,
          padding: "18px",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--card, transparent) 90%, transparent))",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                Project Workspace Access
              </div>
              <h1 style={{ margin: 0, fontSize: isCompactLayout ? "24px" : "28px", lineHeight: 1.1 }}>Workspace Files</h1>
              <div style={mutedTextStyle}>
                Browse the real project workspace, preview generated artifacts, and export exactly what the agent produced.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void handleDownloadSelected()}
                disabled={!effectiveWorkspace}
              >
                {checkedPaths.size > 0 ? `ZIP selected (${checkedPaths.size})` : "ZIP workspace"}
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void handleCopyTerminalCommand(selectedFile)}
                disabled={!effectiveWorkspace}
              >
                Open in terminal
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedTextStyle}>Workspace</span>
              <select
                value={effectiveWorkspace?.id ?? ""}
                style={inputStyle}
                onChange={(event) => setWorkspaceId(event.target.value || null)}
              >
                {workspacesResult.loading ? <option value="">Loading workspaces…</option> : null}
                {!workspacesResult.loading && workspaces.length === 0 ? <option value="">No workspaces found</option> : null}
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedTextStyle}>Search</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search file names and text content"
                style={inputStyle}
                disabled={!effectiveWorkspace}
              />
            </label>
          </div>
          {effectiveWorkspace?.path ? (
            <div style={mutedTextStyle}>
              Root: <code>{effectiveWorkspace.path}</code>
            </div>
          ) : (
            <div style={mutedTextStyle}>
              This project does not currently expose a readable workspace path.
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: isCompactLayout
            ? "minmax(0, 1fr)"
            : "minmax(260px, 340px) minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <section style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
            <div>
              <strong>Tree</strong>
              <div style={mutedTextStyle}>
                Check files or folders to include them in the next ZIP export.
              </div>
            </div>
            {selectedFile ? (
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  const currentFile = selectedFile;
                  if (!currentFile) return;
                  void copyToClipboard(currentFile).then(() => {
                    toast({ title: "Path copied", body: currentFile, tone: "info" });
                  });
                }}
              >
                Copy path
              </button>
            ) : null}
          </div>
          <FileTreePanel
            checkedPaths={checkedPaths}
            emptyDescription="This workspace does not expose any readable files yet."
            emptyTitle="No files"
            error={rootFileList.error ? (rootFileList.error instanceof Error ? rootFileList.error.message : String(rootFileList.error)) : null}
            expandedPaths={expandedPaths}
            loading={rootFileList.loading}
            nodes={nodes}
            onSelectFile={(nextPath) => {
              startTransition(() => {
                setSelectedFile(nextPath);
              });
            }}
            onToggleCheck={handleToggleCheck}
            onToggleDir={(nextPath) => void handleToggleDir(nextPath)}
            selectedFile={selectedFile}
          />
          {loadingDirs.size > 0 ? (
            <div style={mutedTextStyle}>Loading {loadingDirs.size} folder{loadingDirs.size === 1 ? "" : "s"}…</div>
          ) : null}
        </section>

        <section style={{ display: "grid", gap: "16px" }}>
          <section style={sectionStyle}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "grid", gap: "4px" }}>
                <strong>{fileDisplayName(selectedFile)}</strong>
                <span style={mutedTextStyle}>{selectedFile ?? "Choose a file from the tree or search results."}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={!selectedFile}
                  onClick={() => void handleDownloadFile(selectedFile)}
                >
                  Download
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={!selectedFile}
                  onClick={() => void handleCopyTerminalCommand(selectedFile)}
                >
                  Terminal
                </button>
              </div>
            </div>
            {filePreview.loading ? (
              <div style={mutedTextStyle}>Loading preview…</div>
            ) : filePreview.data?.kind === "markdown" ? (
              <pre style={previewTextStyle}>{filePreview.data.content ?? ""}</pre>
            ) : filePreview.data?.kind === "image" ? (
              filePreview.data.imageDataUrl ? (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                  <img
                    src={filePreview.data.imageDataUrl}
                    alt={filePreview.data.name}
                    style={{ maxWidth: "100%", borderRadius: "12px", display: "block" }}
                  />
                </div>
              ) : (
                <div style={mutedTextStyle}>
                  Image preview skipped because the file is larger than the safe inline limit.
                </div>
              )
            ) : filePreview.data?.kind === "code" || filePreview.data?.kind === "text" ? (
              <pre style={codeBlockStyle}>{filePreview.data.content}</pre>
            ) : filePreview.data?.kind === "binary" ? (
              <div style={mutedTextStyle}>
                Binary file, preview unavailable. Use download instead.
              </div>
            ) : filePreview.data?.kind === "directory" ? (
              <div style={mutedTextStyle}>Directories are browsed in the tree and exported via ZIP.</div>
            ) : filePreview.error ? (
              <div style={mutedTextStyle}>
                {filePreview.error instanceof Error ? filePreview.error.message : String(filePreview.error)}
              </div>
            ) : (
              <div style={mutedTextStyle}>
                Select a file to preview Markdown, code, text, or images.
              </div>
            )}
            {filePreview.data ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <span style={mutedTextStyle}>Size: {formatBytes(filePreview.data.sizeBytes)}</span>
                {filePreview.data.language ? <span style={mutedTextStyle}>Language: {filePreview.data.language}</span> : null}
                {filePreview.data.truncated ? <span style={mutedTextStyle}>Preview truncated</span> : null}
              </div>
            ) : null}
          </section>

          <section style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
              <div>
                <strong>Search</strong>
                <div style={mutedTextStyle}>Matches across file names and textual content in the selected workspace.</div>
              </div>
              {searchState.loading ? <span style={mutedTextStyle}>Searching…</span> : null}
            </div>
            {searchState.error ? <div style={mutedTextStyle}>{searchState.error}</div> : null}
            {deferredSearchInput.length < 2 ? (
              <div style={mutedTextStyle}>Enter at least two characters to search.</div>
            ) : null}
            <div style={{ display: "grid", gap: "8px" }}>
              {searchState.results.map((result) => (
                <button
                  key={`${result.path}-${result.matchedBy}`}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setSelectedFile(result.path);
                    });
                  }}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <strong>{result.path}</strong>
                    <span style={mutedTextStyle}>{result.matchedBy}</span>
                  </div>
                  {result.snippet ? (
                    <div style={{ ...mutedTextStyle, marginTop: "4px" }}>{result.snippet}</div>
                  ) : null}
                </button>
              ))}
            </div>
            {searchState.truncated ? (
              <div style={mutedTextStyle}>Results truncated after the safety limit.</div>
            ) : null}
          </section>
        </section>
      </section>
    </main>
  );
}
