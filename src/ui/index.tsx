import type {
  PluginDetailTabProps,
  PluginPageProps,
  PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast,
} from "@paperclipai/plugin-sdk/ui";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";

type ProjectRecord = {
  id: string;
  name: string;
  status: string | null;
};

type WorkspaceRecord = {
  id: string;
  projectId: string;
  name: string;
  path: string;
  label: string;
  isPrimary: boolean;
};

type QueryState = {
  projectId: string | null;
  workspaceId: string | null;
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
  kind: "directory" | "markdown" | "code" | "text" | "image" | "pdf" | "binary";
  mimeType: string | null;
  sizeBytes: number;
  truncated: boolean;
  content: string | null;
  previewDataUrl: string | null;
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

const pluginId = "paperclip-workspace-browser";
const workspaceRoutePath = "workspace-files";

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

function resolveWorkspaceBasePath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);
  const secondLastSegment = segments.at(-2);

  if (secondLastSegment === "plugins" && lastSegment === pluginId) {
    return `/${segments.join("/")}`;
  }

  if (lastSegment === workspaceRoutePath) {
    return `/${segments.join("/")}`;
  }

  return `/${workspaceRoutePath}`;
}

function buildWorkspaceRoute(pathname: string, query: Partial<QueryState>) {
  const basePath = resolveWorkspaceBasePath(pathname);
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function buildCompanyWorkspaceHref(
  companyPrefix: string | null | undefined,
  query: Partial<QueryState> = {},
) {
  const route = buildWorkspaceRoute(`/${workspaceRoutePath}`, query);
  const normalizedPrefix = typeof companyPrefix === "string" ? companyPrefix.trim().toUpperCase() : "";
  return normalizedPrefix ? `/${normalizedPrefix}${route}` : route;
}

function buildPluginPageHref(
  companyPrefix: string | null | undefined,
  query: Partial<QueryState> = {},
) {
  const normalizedPrefix = typeof companyPrefix === "string" ? companyPrefix.trim().toUpperCase() : "";
  const basePath = normalizedPrefix
    ? `/${normalizedPrefix}/plugins/${pluginId}`
    : `/plugins/${pluginId}`;
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function parseQuery(search: string): QueryState {
  const params = new URLSearchParams(search);
  return {
    projectId: params.get("projectId"),
    workspaceId: params.get("workspaceId"),
  };
}

function readWindowQuery(): QueryState {
  if (typeof window === "undefined") {
    return {
      projectId: null,
      workspaceId: null,
    };
  }
  return parseQuery(window.location.search);
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

function WorkspaceBrowserCore({
  companyId,
  description,
  heading,
  leadingControls,
  projectId,
  projectName,
  selectedFile,
  onSelectedFileChange,
  workspaceId,
  onWorkspaceIdChange,
}: {
  companyId: string | null;
  description: string;
  heading: string;
  leadingControls?: ReactNode;
  projectId: string | null;
  projectName: string | null;
  selectedFile: string | null;
  onSelectedFileChange: (filePath: string | null) => void;
  workspaceId: string | null;
  onWorkspaceIdChange: (workspaceId: string | null) => void;
}) {
  const toast = usePluginToast();
  const isCompactLayout = useMediaQuery("(max-width: 1080px)");
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
    companyId: companyId ?? "",
    projectId: projectId ?? "",
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
    if (!projectId) {
      if (workspaceId !== null) onWorkspaceIdChange(null);
      return;
    }
    if (effectiveWorkspace) {
      if (workspaceId !== effectiveWorkspace.id) onWorkspaceIdChange(effectiveWorkspace.id);
      return;
    }
    if (!workspacesResult.loading && workspaceId !== null) {
      onWorkspaceIdChange(null);
    }
  }, [effectiveWorkspace, onWorkspaceIdChange, projectId, workspaceId, workspacesResult.loading]);

  const rootFileList = usePluginData<{ entries: FileEntry[] }>("file-list", {
    companyId: companyId ?? "",
    projectId: projectId ?? "",
    workspaceId: effectiveWorkspace?.id ?? "",
    directoryPath: "",
  });

  const filePreview = usePluginData<PreviewRecord>("file-preview", {
    companyId: companyId ?? "",
    projectId: projectId ?? "",
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
    setSearchInput("");
    setSearchState({
      loading: false,
      error: null,
      results: [],
      truncated: false,
    });
    onSelectedFileChange(null);
  }, [effectiveWorkspace?.id, onSelectedFileChange, projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!companyId || !projectId || !effectiveWorkspace?.id || deferredSearchInput.length < 2) {
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

    if (!companyId || !projectId || !effectiveWorkspace?.id) return;
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
    if (!companyId || !projectId || !effectiveWorkspace?.id) return;
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
    if (!companyId || !projectId || !effectiveWorkspace?.id || !filePath) return;
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
    if (!companyId || !projectId || !effectiveWorkspace?.id) return;
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
                Workspace Access
              </div>
              <h1 style={{ margin: 0, fontSize: isCompactLayout ? "24px" : "28px", lineHeight: 1.1 }}>{heading}</h1>
              <div style={mutedTextStyle}>{description}</div>
              {projectName ? (
                <div style={mutedTextStyle}>
                  Project: <strong style={{ color: "inherit" }}>{projectName}</strong>
                </div>
              ) : null}
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
            {leadingControls}
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedTextStyle}>Workspace</span>
              <select
                value={effectiveWorkspace?.id ?? ""}
                style={inputStyle}
                onChange={(event) => onWorkspaceIdChange(event.target.value || null)}
                disabled={!projectId}
              >
                {workspacesResult.loading ? <option value="">Loading workspaces…</option> : null}
                {!workspacesResult.loading && projectId && workspaces.length === 0 ? <option value="">No workspaces found</option> : null}
                {!projectId ? <option value="">Select a project first</option> : null}
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
          {!projectId ? (
            <div style={mutedTextStyle}>
              Select a project to browse its generated workspace files.
            </div>
          ) : effectiveWorkspace?.path ? (
            <div style={mutedTextStyle}>
              Root: <code>{effectiveWorkspace.path}</code>
            </div>
          ) : workspacesResult.loading ? (
            <div style={mutedTextStyle}>
              Discovering workspace path…
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
                onSelectedFileChange(nextPath);
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
              filePreview.data.previewDataUrl ? (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                  <img
                    src={filePreview.data.previewDataUrl}
                    alt={filePreview.data.name}
                    style={{ maxWidth: "100%", borderRadius: "12px", display: "block" }}
                  />
                </div>
              ) : (
                <div style={mutedTextStyle}>
                  Image preview skipped because the file is larger than the safe inline limit.
                </div>
              )
            ) : filePreview.data?.kind === "pdf" ? (
              filePreview.data.previewDataUrl ? (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                  <iframe
                    src={filePreview.data.previewDataUrl}
                    title={filePreview.data.name}
                    style={{
                      width: "100%",
                      minHeight: "70vh",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      background: "white",
                    }}
                  />
                </div>
              ) : (
                <div style={mutedTextStyle}>
                  PDF preview skipped because the file is larger than the safe inline limit.
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
                Select a file to preview Markdown, code, text, images, or PDFs.
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
                      onSelectedFileChange(result.path);
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

export function WorkspaceSidebarLink({ context }: PluginSidebarProps) {
  const hostNavigation = useHostNavigation();
  const href = buildPluginPageHref(context.companyPrefix);
  const legacyHref = buildCompanyWorkspaceHref(context.companyPrefix);
  const isActive = typeof window !== "undefined" && (
    window.location.pathname === href || window.location.pathname === legacyHref
  );

  return (
    <a
      {...hostNavigation.linkProps(href)}
      aria-current={isActive ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "8px 12px",
        borderRadius: "12px",
        textDecoration: "none",
        color: "inherit",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true">Files</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Workspace Files</span>
    </a>
  );
}

export function WorkspaceBrowserPage({ context }: PluginPageProps) {
  const [query, setQuery] = useState<QueryState>(() => readWindowQuery());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const projectsResult = usePluginData<ProjectRecord[]>("projects", {
    companyId: context.companyId ?? "",
  });
  const projects = projectsResult.data ?? [];
  const queriedProjectExists = query.projectId ? projects.some((project) => project.id === query.projectId) : false;
  const effectiveProject = (queriedProjectExists
    ? projects.find((project) => project.id === query.projectId)
    : null) ?? projects[0] ?? null;
  const effectiveProjectId = effectiveProject?.id ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncQuery = () => setQuery(readWindowQuery());
    window.addEventListener("popstate", syncQuery);
    window.addEventListener("hashchange", syncQuery);
    return () => {
      window.removeEventListener("popstate", syncQuery);
      window.removeEventListener("hashchange", syncQuery);
    };
  }, []);

  function updateQuery(nextQuery: QueryState, replace = false) {
    if (typeof window === "undefined") {
      setQuery(nextQuery);
      return;
    }

    const href = buildWorkspaceRoute(window.location.pathname, nextQuery);
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", href);
    setQuery(nextQuery);
  }

  useEffect(() => {
    if (projects.length === 0) return;
    if (!query.projectId || !queriedProjectExists) {
      updateQuery({
        projectId: projects[0]!.id,
        workspaceId: null,
      }, true);
    }
  }, [projects, query.projectId, queriedProjectExists]);

  useEffect(() => {
    setSelectedFile(null);
  }, [effectiveProjectId, query.workspaceId]);

  return (
    <WorkspaceBrowserCore
      companyId={context.companyId}
      description="Browse generated files across projects from one stable workspace browser entry."
      heading="Workspace Files"
      leadingControls={(
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={mutedTextStyle}>Project</span>
          <select
            value={effectiveProjectId ?? ""}
            style={inputStyle}
            onChange={(event) => {
              const nextProjectId = event.target.value || null;
              updateQuery({
                projectId: nextProjectId,
                workspaceId: null,
              });
            }}
          >
            {projectsResult.loading ? <option value="">Loading projects…</option> : null}
            {!projectsResult.loading && projects.length === 0 ? <option value="">No projects found</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      )}
      projectId={effectiveProjectId}
      projectName={effectiveProject?.name ?? null}
      selectedFile={selectedFile}
      onSelectedFileChange={setSelectedFile}
      workspaceId={query.workspaceId}
      onWorkspaceIdChange={(nextWorkspaceId) =>
        updateQuery({
          projectId: effectiveProjectId,
          workspaceId: nextWorkspaceId,
        }, true)
      }
    />
  );
}

export function WorkspaceBrowserTab({ context }: PluginDetailTabProps) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaceId(null);
    setSelectedFile(null);
  }, [context.entityId]);

  return (
    <WorkspaceBrowserCore
      companyId={context.companyId}
      description="Browse the real project workspace, preview generated artifacts, and export exactly what the agent produced."
      heading="Workspace Files"
      projectId={context.entityId}
      projectName={null}
      selectedFile={selectedFile}
      onSelectedFileChange={setSelectedFile}
      workspaceId={workspaceId}
      onWorkspaceIdChange={setWorkspaceId}
    />
  );
}

type CompanyRecord = {
  id: string;
  issuePrefix?: string | null;
  name?: string | null;
};

async function hostFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.json() as T;
}

async function hostGetData<T>(key: string, params: Record<string, unknown>): Promise<T> {
  const response = await hostFetchJson<{ data: T }>(
    `/api/plugins/${pluginId}/data/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: JSON.stringify({ params }),
    },
  );
  return response.data;
}

function currentCompanyPrefix() {
  if (typeof window === "undefined") return null;
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]?.trim();
  return first ? first.toUpperCase() : null;
}

async function resolveCompanyId() {
  const companies = await hostFetchJson<CompanyRecord[]>("/api/companies");
  const prefix = currentCompanyPrefix();
  if (prefix) {
    const matched = companies.find((company) => (company.issuePrefix ?? "").trim().toUpperCase() === prefix);
    if (matched?.id) return matched.id;
  }
  return companies[0]?.id ?? null;
}

function StandalonePreview({ preview }: { preview: Exclude<PreviewRecord, null> }) {
  if (preview.kind === "markdown") {
    return <pre style={previewTextStyle}>{preview.content ?? ""}</pre>;
  }

  if (preview.kind === "image") {
    return preview.previewDataUrl ? (
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
        <img
          src={preview.previewDataUrl}
          alt={preview.name}
          style={{ maxWidth: "100%", borderRadius: "12px", display: "block" }}
        />
      </div>
    ) : (
      <div style={mutedTextStyle}>Image preview unavailable for this file.</div>
    );
  }

  if (preview.kind === "pdf") {
    return preview.previewDataUrl ? (
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
        <iframe
          src={preview.previewDataUrl}
          title={preview.name}
          style={{
            width: "100%",
            minHeight: "70vh",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            background: "white",
          }}
        />
      </div>
    ) : (
      <div style={mutedTextStyle}>PDF preview unavailable for this file.</div>
    );
  }

  if (preview.kind === "code" || preview.kind === "text") {
    return <pre style={codeBlockStyle}>{preview.content ?? ""}</pre>;
  }

  if (preview.kind === "binary") {
    return <div style={mutedTextStyle}>Binary file, preview unavailable.</div>;
  }

  if (preview.kind === "directory") {
    return <div style={mutedTextStyle}>Directories are browsed in the tree.</div>;
  }

  return <div style={mutedTextStyle}>Preview unavailable.</div>;
}

function StandaloneWorkspaceBrowser() {
  const isCompactLayout = useMediaQuery("(max-width: 960px)");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(new Set([""]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRecord>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextCompanyId = await resolveCompanyId();
        if (!cancelled) setCompanyId(nextCompanyId);
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await hostGetData<ProjectRecord[]>("projects", { companyId });
        if (cancelled) return;
        setProjects(data);
        setProjectId((current) => current && data.some((project) => project.id === current) ? current : (data[0]?.id ?? null));
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await hostGetData<WorkspaceRecord[]>("project-workspaces", { companyId, projectId });
        if (cancelled) return;
        setWorkspaces(data);
        const nextWorkspaceId = data.find((workspace) => workspace.id === workspaceId)?.id ?? data[0]?.id ?? null;
        setWorkspaceId(nextWorkspaceId);
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId]);

  useEffect(() => {
    if (!companyId || !projectId || !workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await hostGetData<{ entries: FileEntry[] }>("file-list", {
          companyId,
          projectId,
          workspaceId,
          directoryPath: "",
        });
        if (cancelled) return;
        setNodes(fileTreeNodes(data.entries ?? []));
        setExpandedPaths(new Set());
        setLoadedDirs(new Set([""]));
        setLoadingDirs(new Set());
        setSelectedFile(null);
        setPreview(null);
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId, workspaceId]);

  useEffect(() => {
    if (!companyId || !projectId || !workspaceId || !selectedFile) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    void (async () => {
      try {
        const data = await hostGetData<PreviewRecord>("file-preview", {
          companyId,
          projectId,
          workspaceId,
          filePath: selectedFile,
        });
        if (!cancelled) setPreview(data);
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId, workspaceId, selectedFile]);

  async function handleToggleDir(dirPath: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });

    if (!companyId || !projectId || !workspaceId) return;
    if (loadedDirs.has(dirPath) || loadingDirs.has(dirPath)) return;

    setLoadingDirs((current) => new Set(current).add(dirPath));
    try {
      const data = await hostGetData<{ entries: FileEntry[] }>("file-list", {
        companyId,
        projectId,
        workspaceId,
        directoryPath: dirPath,
      });
      setNodes((current) => setChildrenAtPath(current, dirPath, fileTreeNodes(data.entries ?? [])));
      setLoadedDirs((current) => new Set(current).add(dirPath));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoadingDirs((current) => {
        const next = new Set(current);
        next.delete(dirPath);
        return next;
      });
    }
  }

  const projectName = projects.find((project) => project.id === projectId)?.name ?? null;
  const workspaceLabelValue = workspaces.find((workspace) => workspace.id === workspaceId)?.label ?? null;

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
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
              Workspace Access
            </div>
            <h1 style={{ margin: 0, fontSize: isCompactLayout ? "24px" : "28px", lineHeight: 1.1 }}>Workspace Files</h1>
            <div style={mutedTextStyle}>Plugin self-render fallback active while the host slot loader is broken.</div>
            {projectName ? <div style={mutedTextStyle}>Project: <strong style={{ color: "inherit" }}>{projectName}</strong></div> : null}
            {workspaceLabelValue ? <div style={mutedTextStyle}>Workspace: <strong style={{ color: "inherit" }}>{workspaceLabelValue}</strong></div> : null}
          </div>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedTextStyle}>Project</span>
              <select value={projectId ?? ""} style={inputStyle} onChange={(event) => setProjectId(event.target.value || null)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedTextStyle}>Workspace</span>
              <select value={workspaceId ?? ""} style={inputStyle} onChange={(event) => setWorkspaceId(event.target.value || null)}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.label}</option>
                ))}
              </select>
            </label>
          </div>
          {error ? <div style={{ ...mutedTextStyle, color: "var(--destructive, #c00)" }}>{error}</div> : null}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: isCompactLayout ? "minmax(0, 1fr)" : "minmax(260px, 340px) minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <section style={sectionStyle}>
          <div>
            <strong>Tree</strong>
            <div style={mutedTextStyle}>Browse the project workspace directly from the plugin bundle.</div>
          </div>
          <FileTreePanel
            checkedPaths={new Set()}
            emptyDescription="This workspace does not expose any readable files yet."
            emptyTitle="No files"
            error={error}
            expandedPaths={expandedPaths}
            loading={!companyId || !projectId || !workspaceId}
            nodes={nodes}
            onSelectFile={setSelectedFile}
            onToggleCheck={() => undefined}
            onToggleDir={(nextPath) => void handleToggleDir(nextPath)}
            selectedFile={selectedFile}
          />
        </section>

        <section style={sectionStyle}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong>{fileDisplayName(selectedFile)}</strong>
            <span style={mutedTextStyle}>{selectedFile ?? "Select a file to preview it."}</span>
          </div>
          {loadingPreview ? (
            <div style={mutedTextStyle}>Loading preview…</div>
          ) : preview ? (
            <>
              <StandalonePreview preview={preview} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <span style={mutedTextStyle}>Size: {formatBytes(preview.sizeBytes)}</span>
                {preview.language ? <span style={mutedTextStyle}>Language: {preview.language}</span> : null}
                {preview.truncated ? <span style={mutedTextStyle}>Preview truncated</span> : null}
              </div>
            </>
          ) : (
            <div style={mutedTextStyle}>Select a file to preview Markdown, code, text, images, or PDFs.</div>
          )}
        </section>
      </section>
    </main>
  );
}

function findExactTextElement(text: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div, span, a, p"));
  return candidates.find((element) => element.textContent?.trim() === text) ?? null;
}

function mountStandaloneWorkspaceBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const placeholder = findExactTextElement("Workspace Browser: Workspace Files");
  if (!placeholder) return;

  const mountNode = placeholder.parentElement ?? placeholder;
  if (mountNode.dataset.workspaceBrowserStandaloneMounted === "true") return;

  mountNode.dataset.workspaceBrowserStandaloneMounted = "true";
  mountNode.innerHTML = "";
  createRoot(mountNode).render(<StandaloneWorkspaceBrowser />);
}

function replaceSidebarPlaceholderWithLink() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const placeholders = Array.from(document.querySelectorAll<HTMLElement>("div, span"))
    .filter((element) => element.textContent?.trim() === "Workspace Browser: Workspace Files");

  for (const element of placeholders) {
    if (element.closest("[data-workspace-browser-standalone-mounted='true']")) continue;
    const wrapper = element.parentElement ?? element;
    if ((wrapper.textContent ?? "").includes("Back")) continue;
    if (wrapper.dataset.workspaceBrowserSidebarLinked === "true") continue;
    wrapper.dataset.workspaceBrowserSidebarLinked = "true";
    wrapper.innerHTML = "";
    const link = document.createElement("a");
    link.href = buildCompanyWorkspaceHref(currentCompanyPrefix());
    link.textContent = "Workspace Files";
    Object.assign(link.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      width: "100%",
      padding: "8px 12px",
      textDecoration: "none",
      color: "inherit",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
    });
    wrapper.appendChild(link);
  }
}

function bootstrapStandaloneFallback() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const sync = () => {
    const path = window.location.pathname;
    if (path.endsWith("/workspace-files")) {
      mountStandaloneWorkspaceBrowser();
    } else {
      replaceSidebarPlaceholderWithLink();
    }
  };

  sync();
  const observer = new MutationObserver(() => sync());
  observer.observe(document.body, { childList: true, subtree: true });
}

bootstrapStandaloneFallback();
