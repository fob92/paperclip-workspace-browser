// src/ui/index.tsx
import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";
import { createRoot } from "react-dom/client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var pluginId = "paperclip-workspace-browser";
var workspaceRoutePath = "workspace-files";
var cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--card, transparent) 92%, transparent)",
  overflow: "hidden"
};
var sectionStyle = {
  ...cardStyle,
  display: "grid",
  gap: "12px",
  padding: "16px",
  minWidth: 0
};
var mutedTextStyle = {
  fontSize: "12px",
  color: "var(--muted-foreground)",
  lineHeight: 1.45
};
var buttonStyle = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "7px 12px",
  fontSize: "12px",
  cursor: "pointer"
};
var inputStyle = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  background: "transparent",
  color: "inherit",
  padding: "10px 12px",
  fontSize: "13px"
};
var codeBlockStyle = {
  margin: 0,
  padding: "16px",
  borderTop: "1px solid var(--border)",
  fontSize: "12px",
  lineHeight: 1.55,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  overflow: "auto",
  background: "color-mix(in srgb, var(--muted, #888) 10%, transparent)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};
var previewTextStyle = {
  ...codeBlockStyle,
  fontFamily: "inherit"
};
function resolveWorkspaceBasePath(pathname) {
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
function buildWorkspaceRoute(pathname, query) {
  const basePath = resolveWorkspaceBasePath(pathname);
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}
function buildCompanyWorkspaceHref(companyPrefix, query = {}) {
  const route = buildWorkspaceRoute(`/${workspaceRoutePath}`, query);
  const normalizedPrefix = typeof companyPrefix === "string" ? companyPrefix.trim().toUpperCase() : "";
  return normalizedPrefix ? `/${normalizedPrefix}${route}` : route;
}
function buildPluginPageHref(companyPrefix, query = {}) {
  const normalizedPrefix = typeof companyPrefix === "string" ? companyPrefix.trim().toUpperCase() : "";
  const basePath = normalizedPrefix ? `/${normalizedPrefix}/plugins/${pluginId}` : `/plugins/${pluginId}`;
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}
function parseQuery(search) {
  const params = new URLSearchParams(search);
  return {
    projectId: params.get("projectId"),
    workspaceId: params.get("workspaceId")
  };
}
function readWindowQuery() {
  if (typeof window === "undefined") {
    return {
      projectId: null,
      workspaceId: null
    };
  }
  return parseQuery(window.location.search);
}
function formatBytes(value) {
  if (value == null) return "folder";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function fileTreeNodes(entries) {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.isDirectory ? "dir" : "file",
    children: []
  }));
}
function setChildrenAtPath(nodes, targetPath, children) {
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
function parentDirectory(filePath) {
  if (!filePath) return null;
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}
function fileDisplayName(filePath) {
  if (!filePath) return "No file selected";
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}
async function copyToClipboard(value) {
  await navigator.clipboard.writeText(value);
}
function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return void 0;
    }
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);
  return matches;
}
function triggerDownload(payload) {
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
  selectedFile
}) {
  function renderNodes(currentNodes, depth = 0) {
    return currentNodes.map((node) => {
      const isDirectory = node.kind === "dir";
      const isExpanded = expandedPaths.has(node.path);
      const isChecked = checkedPaths.has(node.path);
      const isSelected = !isDirectory && selectedFile === node.path;
      return /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "20px 18px minmax(0, 1fr)",
              gap: "8px",
              alignItems: "center",
              paddingLeft: `${depth * 14}px`
            },
            children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  "aria-label": isDirectory ? isExpanded ? "Collapse folder" : "Expand folder" : "File",
                  onClick: () => {
                    if (isDirectory) onToggleDir(node.path);
                  },
                  style: {
                    ...buttonStyle,
                    padding: "0",
                    width: "20px",
                    height: "20px",
                    borderRadius: "8px",
                    fontSize: "11px",
                    cursor: isDirectory ? "pointer" : "default",
                    opacity: isDirectory ? 1 : 0.45
                  },
                  disabled: !isDirectory,
                  children: isDirectory ? isExpanded ? "\u2212" : "+" : "\u2022"
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: isChecked,
                  onChange: () => onToggleCheck(node.path),
                  "aria-label": `Select ${node.path}`
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (isDirectory) onToggleDir(node.path);
                    else onSelectFile(node.path);
                  },
                  style: {
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    background: isSelected ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    padding: "8px 10px",
                    textAlign: "left",
                    width: "100%",
                    overflow: "hidden"
                  },
                  children: /* @__PURE__ */ jsxs(
                    "div",
                    {
                      style: {
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        justifyContent: "space-between"
                      },
                      children: [
                        /* @__PURE__ */ jsx(
                          "span",
                          {
                            style: {
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontWeight: isSelected ? 700 : 500
                            },
                            children: node.name
                          }
                        ),
                        /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: isDirectory ? "dir" : "file" })
                      ]
                    }
                  )
                }
              )
            ]
          }
        ),
        isDirectory && isExpanded && node.children.length > 0 ? /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "6px" }, children: renderNodes(node.children, depth + 1) }) : null
      ] }, node.path);
    });
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Loading files\u2026" });
  }
  if (error) {
    return /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: error });
  }
  if (nodes.length === 0) {
    return /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
      /* @__PURE__ */ jsx("strong", { children: emptyTitle }),
      /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: emptyDescription })
    ] });
  }
  return /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "6px" }, children: renderNodes(nodes) });
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
  onWorkspaceIdChange
}) {
  const toast = usePluginToast();
  const isCompactLayout = useMediaQuery("(max-width: 1080px)");
  const [nodes, setNodes] = useState([]);
  const [expandedPaths, setExpandedPaths] = useState(() => /* @__PURE__ */ new Set());
  const [loadedDirs, setLoadedDirs] = useState(() => /* @__PURE__ */ new Set());
  const [loadingDirs, setLoadingDirs] = useState(() => /* @__PURE__ */ new Set());
  const [checkedPaths, setCheckedPaths] = useState(() => /* @__PURE__ */ new Set());
  const [searchInput, setSearchInput] = useState("");
  const deferredSearchInput = useDeferredValue(searchInput.trim());
  const [searchState, setSearchState] = useState({
    loading: false,
    error: null,
    results: [],
    truncated: false
  });
  const workspacesResult = usePluginData("project-workspaces", {
    companyId: companyId ?? "",
    projectId: projectId ?? ""
  });
  const workspaces = workspacesResult.data ?? [];
  const effectiveWorkspace = useMemo(() => {
    if (workspaces.length === 0) return null;
    return workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces.find((workspace) => workspace.isPrimary) ?? workspaces[0] ?? null;
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
  const rootFileList = usePluginData("file-list", {
    companyId: companyId ?? "",
    projectId: projectId ?? "",
    workspaceId: effectiveWorkspace?.id ?? "",
    directoryPath: ""
  });
  const filePreview = usePluginData("file-preview", {
    companyId: companyId ?? "",
    projectId: projectId ?? "",
    workspaceId: effectiveWorkspace?.id ?? "",
    filePath: selectedFile ?? ""
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
    setExpandedPaths(/* @__PURE__ */ new Set());
    setLoadedDirs(/* @__PURE__ */ new Set());
    setLoadingDirs(/* @__PURE__ */ new Set());
    setCheckedPaths(/* @__PURE__ */ new Set());
    setSearchInput("");
    setSearchState({
      loading: false,
      error: null,
      results: [],
      truncated: false
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
        truncated: false
      });
      return;
    }
    setSearchState((current) => ({ ...current, loading: true, error: null }));
    void searchWorkspace({
      companyId,
      projectId,
      workspaceId: effectiveWorkspace.id,
      query: deferredSearchInput,
      mode: "both"
    }).then((response) => {
      if (cancelled) return;
      const payload = response;
      setSearchState({
        loading: false,
        error: null,
        results: payload.results ?? [],
        truncated: payload.truncated ?? false
      });
    }).catch((error) => {
      if (cancelled) return;
      setSearchState({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        results: [],
        truncated: false
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
          directoryPath: currentPath
        });
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
  async function handleToggleDir(dirPath) {
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
        directoryPath: dirPath
      });
      setNodes((current) => setChildrenAtPath(current, dirPath, fileTreeNodes(response.entries ?? [])));
      setLoadedDirs((current) => new Set(current).add(dirPath));
    } catch (error) {
      toast({
        title: "Directory load failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setLoadingDirs((current) => {
        const next = new Set(current);
        next.delete(dirPath);
        return next;
      });
    }
  }
  function handleToggleCheck(targetPath) {
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
        archiveBaseName: checkedPaths.size > 0 ? "workspace-selection" : "workspace-files"
      });
      triggerDownload(response);
      toast({
        title: "ZIP ready",
        body: response.fileName,
        tone: "success"
      });
    } catch (error) {
      toast({
        title: "ZIP export failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }
  async function handleDownloadFile(filePath) {
    if (!companyId || !projectId || !effectiveWorkspace?.id || !filePath) return;
    try {
      const response = await downloadFile({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        filePath
      });
      triggerDownload(response);
    } catch (error) {
      toast({
        title: "Download failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }
  async function handleCopyTerminalCommand(targetPath) {
    if (!companyId || !projectId || !effectiveWorkspace?.id) return;
    try {
      const response = await terminalCommand({
        companyId,
        projectId,
        workspaceId: effectiveWorkspace.id,
        targetPath: targetPath ?? ""
      });
      await copyToClipboard(response.command);
      toast({
        title: "Terminal command copied",
        body: response.command,
        tone: "info"
      });
    } catch (error) {
      toast({
        title: "Terminal command failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }
  return /* @__PURE__ */ jsxs(
    "main",
    {
      style: {
        display: "grid",
        gap: "16px",
        padding: isCompactLayout ? "14px" : "18px",
        color: "inherit",
        width: "100%"
      },
      children: [
        /* @__PURE__ */ jsx(
          "section",
          {
            style: {
              ...cardStyle,
              padding: "18px",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--card, transparent) 90%, transparent))"
            },
            children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "12px" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)" }, children: "Workspace Access" }),
                  /* @__PURE__ */ jsx("h1", { style: { margin: 0, fontSize: isCompactLayout ? "24px" : "28px", lineHeight: 1.1 }, children: heading }),
                  /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: description }),
                  projectName ? /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
                    "Project: ",
                    /* @__PURE__ */ jsx("strong", { style: { color: "inherit" }, children: projectName })
                  ] }) : null
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      style: buttonStyle,
                      onClick: () => void handleDownloadSelected(),
                      disabled: !effectiveWorkspace,
                      children: checkedPaths.size > 0 ? `ZIP selected (${checkedPaths.size})` : "ZIP workspace"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      style: buttonStyle,
                      onClick: () => void handleCopyTerminalCommand(selectedFile),
                      disabled: !effectiveWorkspace,
                      children: "Open in terminal"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }, children: [
                leadingControls,
                /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
                  /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Workspace" }),
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      value: effectiveWorkspace?.id ?? "",
                      style: inputStyle,
                      onChange: (event) => onWorkspaceIdChange(event.target.value || null),
                      disabled: !projectId,
                      children: [
                        workspacesResult.loading ? /* @__PURE__ */ jsx("option", { value: "", children: "Loading workspaces\u2026" }) : null,
                        !workspacesResult.loading && projectId && workspaces.length === 0 ? /* @__PURE__ */ jsx("option", { value: "", children: "No workspaces found" }) : null,
                        !projectId ? /* @__PURE__ */ jsx("option", { value: "", children: "Select a project first" }) : null,
                        workspaces.map((workspace) => /* @__PURE__ */ jsx("option", { value: workspace.id, children: workspace.label }, workspace.id))
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
                  /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Search" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      value: searchInput,
                      onChange: (event) => setSearchInput(event.target.value),
                      placeholder: "Search file names and text content",
                      style: inputStyle,
                      disabled: !effectiveWorkspace
                    }
                  )
                ] })
              ] }),
              !projectId ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Select a project to browse its generated workspace files." }) : effectiveWorkspace?.path ? /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
                "Root: ",
                /* @__PURE__ */ jsx("code", { children: effectiveWorkspace.path })
              ] }) : workspacesResult.loading ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Discovering workspace path\u2026" }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "This project does not currently expose a readable workspace path." })
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "section",
          {
            style: {
              display: "grid",
              gap: "16px",
              gridTemplateColumns: isCompactLayout ? "minmax(0, 1fr)" : "minmax(260px, 340px) minmax(0, 1fr)",
              alignItems: "start"
            },
            children: [
              /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("strong", { children: "Tree" }),
                    /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Check files or folders to include them in the next ZIP export." })
                  ] }),
                  selectedFile ? /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      style: buttonStyle,
                      onClick: () => {
                        const currentFile = selectedFile;
                        if (!currentFile) return;
                        void copyToClipboard(currentFile).then(() => {
                          toast({ title: "Path copied", body: currentFile, tone: "info" });
                        });
                      },
                      children: "Copy path"
                    }
                  ) : null
                ] }),
                /* @__PURE__ */ jsx(
                  FileTreePanel,
                  {
                    checkedPaths,
                    emptyDescription: "This workspace does not expose any readable files yet.",
                    emptyTitle: "No files",
                    error: rootFileList.error ? rootFileList.error instanceof Error ? rootFileList.error.message : String(rootFileList.error) : null,
                    expandedPaths,
                    loading: rootFileList.loading,
                    nodes,
                    onSelectFile: (nextPath) => {
                      startTransition(() => {
                        onSelectedFileChange(nextPath);
                      });
                    },
                    onToggleCheck: handleToggleCheck,
                    onToggleDir: (nextPath) => void handleToggleDir(nextPath),
                    selectedFile
                  }
                ),
                loadingDirs.size > 0 ? /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
                  "Loading ",
                  loadingDirs.size,
                  " folder",
                  loadingDirs.size === 1 ? "" : "s",
                  "\u2026"
                ] }) : null
              ] }),
              /* @__PURE__ */ jsxs("section", { style: { display: "grid", gap: "16px" }, children: [
                /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }, children: [
                    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                      /* @__PURE__ */ jsx("strong", { children: fileDisplayName(selectedFile) }),
                      /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: selectedFile ?? "Choose a file from the tree or search results." })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
                      /* @__PURE__ */ jsx(
                        "button",
                        {
                          type: "button",
                          style: buttonStyle,
                          disabled: !selectedFile,
                          onClick: () => void handleDownloadFile(selectedFile),
                          children: "Download"
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        "button",
                        {
                          type: "button",
                          style: buttonStyle,
                          disabled: !selectedFile,
                          onClick: () => void handleCopyTerminalCommand(selectedFile),
                          children: "Terminal"
                        }
                      )
                    ] })
                  ] }),
                  filePreview.loading ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Loading preview\u2026" }) : filePreview.data?.kind === "markdown" ? /* @__PURE__ */ jsx("pre", { style: previewTextStyle, children: filePreview.data.content ?? "" }) : filePreview.data?.kind === "image" ? filePreview.data.previewDataUrl ? /* @__PURE__ */ jsx("div", { style: { borderTop: "1px solid var(--border)", paddingTop: "16px" }, children: /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: filePreview.data.previewDataUrl,
                      alt: filePreview.data.name,
                      style: { maxWidth: "100%", borderRadius: "12px", display: "block" }
                    }
                  ) }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Image preview skipped because the file is larger than the safe inline limit." }) : filePreview.data?.kind === "pdf" ? filePreview.data.previewDataUrl ? /* @__PURE__ */ jsx("div", { style: { borderTop: "1px solid var(--border)", paddingTop: "16px" }, children: /* @__PURE__ */ jsx(
                    "iframe",
                    {
                      src: filePreview.data.previewDataUrl,
                      title: filePreview.data.name,
                      style: {
                        width: "100%",
                        minHeight: "70vh",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        background: "white"
                      }
                    }
                  ) }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "PDF preview skipped because the file is larger than the safe inline limit." }) : filePreview.data?.kind === "code" || filePreview.data?.kind === "text" ? /* @__PURE__ */ jsx("pre", { style: codeBlockStyle, children: filePreview.data.content }) : filePreview.data?.kind === "binary" ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Binary file, preview unavailable. Use download instead." }) : filePreview.data?.kind === "directory" ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Directories are browsed in the tree and exported via ZIP." }) : filePreview.error ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: filePreview.error instanceof Error ? filePreview.error.message : String(filePreview.error) }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Select a file to preview Markdown, code, text, images, or PDFs." }),
                  filePreview.data ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px" }, children: [
                    /* @__PURE__ */ jsxs("span", { style: mutedTextStyle, children: [
                      "Size: ",
                      formatBytes(filePreview.data.sizeBytes)
                    ] }),
                    filePreview.data.language ? /* @__PURE__ */ jsxs("span", { style: mutedTextStyle, children: [
                      "Language: ",
                      filePreview.data.language
                    ] }) : null,
                    filePreview.data.truncated ? /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Preview truncated" }) : null
                  ] }) : null
                ] }),
                /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }, children: [
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("strong", { children: "Search" }),
                      /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Matches across file names and textual content in the selected workspace." })
                    ] }),
                    searchState.loading ? /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Searching\u2026" }) : null
                  ] }),
                  searchState.error ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: searchState.error }) : null,
                  deferredSearchInput.length < 2 ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Enter at least two characters to search." }) : null,
                  /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "8px" }, children: searchState.results.map((result) => /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        startTransition(() => {
                          onSelectedFileChange(result.path);
                        });
                      },
                      style: {
                        textAlign: "left",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "10px 12px",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer"
                      },
                      children: [
                        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px" }, children: [
                          /* @__PURE__ */ jsx("strong", { children: result.path }),
                          /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: result.matchedBy })
                        ] }),
                        result.snippet ? /* @__PURE__ */ jsx("div", { style: { ...mutedTextStyle, marginTop: "4px" }, children: result.snippet }) : null
                      ]
                    },
                    `${result.path}-${result.matchedBy}`
                  )) }),
                  searchState.truncated ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Results truncated after the safety limit." }) : null
                ] })
              ] })
            ]
          }
        )
      ]
    }
  );
}
function WorkspaceSidebarLink({ context }) {
  const hostNavigation = useHostNavigation();
  const href = buildPluginPageHref(context.companyPrefix);
  const legacyHref = buildCompanyWorkspaceHref(context.companyPrefix);
  const isActive = typeof window !== "undefined" && (window.location.pathname === href || window.location.pathname === legacyHref);
  return /* @__PURE__ */ jsxs(
    "a",
    {
      ...hostNavigation.linkProps(href),
      "aria-current": isActive ? "page" : void 0,
      style: {
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
        cursor: "pointer"
      },
      children: [
        /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "Files" }),
        /* @__PURE__ */ jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: "Workspace Files" })
      ]
    }
  );
}
function WorkspaceBrowserPage({ context }) {
  const [query, setQuery] = useState(() => readWindowQuery());
  const [selectedFile, setSelectedFile] = useState(null);
  const projectsResult = usePluginData("projects", {
    companyId: context.companyId ?? ""
  });
  const projects = projectsResult.data ?? [];
  const queriedProjectExists = query.projectId ? projects.some((project) => project.id === query.projectId) : false;
  const effectiveProject = (queriedProjectExists ? projects.find((project) => project.id === query.projectId) : null) ?? projects[0] ?? null;
  const effectiveProjectId = effectiveProject?.id ?? null;
  useEffect(() => {
    if (typeof window === "undefined") return void 0;
    const syncQuery = () => setQuery(readWindowQuery());
    window.addEventListener("popstate", syncQuery);
    window.addEventListener("hashchange", syncQuery);
    return () => {
      window.removeEventListener("popstate", syncQuery);
      window.removeEventListener("hashchange", syncQuery);
    };
  }, []);
  function updateQuery(nextQuery, replace = false) {
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
        projectId: projects[0].id,
        workspaceId: null
      }, true);
    }
  }, [projects, query.projectId, queriedProjectExists]);
  useEffect(() => {
    setSelectedFile(null);
  }, [effectiveProjectId, query.workspaceId]);
  return /* @__PURE__ */ jsx(
    WorkspaceBrowserCore,
    {
      companyId: context.companyId,
      description: "Browse generated files across projects from one stable workspace browser entry.",
      heading: "Workspace Files",
      leadingControls: /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Project" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: effectiveProjectId ?? "",
            style: inputStyle,
            onChange: (event) => {
              const nextProjectId = event.target.value || null;
              updateQuery({
                projectId: nextProjectId,
                workspaceId: null
              });
            },
            children: [
              projectsResult.loading ? /* @__PURE__ */ jsx("option", { value: "", children: "Loading projects\u2026" }) : null,
              !projectsResult.loading && projects.length === 0 ? /* @__PURE__ */ jsx("option", { value: "", children: "No projects found" }) : null,
              projects.map((project) => /* @__PURE__ */ jsx("option", { value: project.id, children: project.name }, project.id))
            ]
          }
        )
      ] }),
      projectId: effectiveProjectId,
      projectName: effectiveProject?.name ?? null,
      selectedFile,
      onSelectedFileChange: setSelectedFile,
      workspaceId: query.workspaceId,
      onWorkspaceIdChange: (nextWorkspaceId) => updateQuery({
        projectId: effectiveProjectId,
        workspaceId: nextWorkspaceId
      }, true)
    }
  );
}
function WorkspaceBrowserTab({ context }) {
  const [workspaceId, setWorkspaceId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  useEffect(() => {
    setWorkspaceId(null);
    setSelectedFile(null);
  }, [context.entityId]);
  return /* @__PURE__ */ jsx(
    WorkspaceBrowserCore,
    {
      companyId: context.companyId,
      description: "Browse the real project workspace, preview generated artifacts, and export exactly what the agent produced.",
      heading: "Workspace Files",
      projectId: context.entityId,
      projectName: null,
      selectedFile,
      onSelectedFileChange: setSelectedFile,
      workspaceId,
      onWorkspaceIdChange: setWorkspaceId
    }
  );
}
async function hostFetchJson(url, init) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init?.body ? { "Content-Type": "application/json" } : {},
      ...init?.headers ?? {}
    },
    ...init
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}
async function hostGetData(key, params) {
  const response = await hostFetchJson(
    `/api/plugins/${pluginId}/data/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: JSON.stringify({ params })
    }
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
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("paperclip.selectedCompanyId");
    const trimmed = stored?.trim();
    if (trimmed) return trimmed;
  }
  try {
    const companies = await hostFetchJson("/api/companies");
    const prefix = currentCompanyPrefix();
    if (prefix) {
      const matched = companies.find((company) => (company.issuePrefix ?? "").trim().toUpperCase() === prefix);
      if (matched?.id) return matched.id;
    }
    return companies[0]?.id ?? null;
  } catch (err) {
    console.warn("[workspace-browser] GET /api/companies failed; company context unavailable.", err);
    return null;
  }
}
function StandalonePreview({ preview }) {
  if (preview.kind === "markdown") {
    return /* @__PURE__ */ jsx("pre", { style: previewTextStyle, children: preview.content ?? "" });
  }
  if (preview.kind === "image") {
    return preview.previewDataUrl ? /* @__PURE__ */ jsx("div", { style: { borderTop: "1px solid var(--border)", paddingTop: "16px" }, children: /* @__PURE__ */ jsx(
      "img",
      {
        src: preview.previewDataUrl,
        alt: preview.name,
        style: { maxWidth: "100%", borderRadius: "12px", display: "block" }
      }
    ) }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Image preview unavailable for this file." });
  }
  if (preview.kind === "pdf") {
    return preview.previewDataUrl ? /* @__PURE__ */ jsx("div", { style: { borderTop: "1px solid var(--border)", paddingTop: "16px" }, children: /* @__PURE__ */ jsx(
      "iframe",
      {
        src: preview.previewDataUrl,
        title: preview.name,
        style: {
          width: "100%",
          minHeight: "70vh",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          background: "white"
        }
      }
    ) }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "PDF preview unavailable for this file." });
  }
  if (preview.kind === "code" || preview.kind === "text") {
    return /* @__PURE__ */ jsx("pre", { style: codeBlockStyle, children: preview.content ?? "" });
  }
  if (preview.kind === "binary") {
    return /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Binary file, preview unavailable." });
  }
  if (preview.kind === "directory") {
    return /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Directories are browsed in the tree." });
  }
  return /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Preview unavailable." });
}
function StandaloneWorkspaceBrowser() {
  const isCompactLayout = useMediaQuery("(max-width: 960px)");
  const [companyId, setCompanyId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [expandedPaths, setExpandedPaths] = useState(/* @__PURE__ */ new Set());
  const [loadedDirs, setLoadedDirs] = useState(/* @__PURE__ */ new Set([""]));
  const [loadingDirs, setLoadingDirs] = useState(/* @__PURE__ */ new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextCompanyId = await resolveCompanyId();
      if (!cancelled) {
        setCompanyId(nextCompanyId);
        if (nextCompanyId === null) {
          setError(
            "Unable to resolve company context. Please ensure you are logged in to Paperclip and have selected a company, then refresh the page."
          );
        }
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
        const data = await hostGetData("projects", { companyId });
        if (cancelled) return;
        setProjects(data);
        setProjectId((current) => current && data.some((project) => project.id === current) ? current : data[0]?.id ?? null);
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
        const data = await hostGetData("project-workspaces", { companyId, projectId });
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
        const data = await hostGetData("file-list", {
          companyId,
          projectId,
          workspaceId,
          directoryPath: ""
        });
        if (cancelled) return;
        setNodes(fileTreeNodes(data.entries ?? []));
        setExpandedPaths(/* @__PURE__ */ new Set());
        setLoadedDirs(/* @__PURE__ */ new Set([""]));
        setLoadingDirs(/* @__PURE__ */ new Set());
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
        const data = await hostGetData("file-preview", {
          companyId,
          projectId,
          workspaceId,
          filePath: selectedFile
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
  async function handleToggleDir(dirPath) {
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
      const data = await hostGetData("file-list", {
        companyId,
        projectId,
        workspaceId,
        directoryPath: dirPath
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
  return /* @__PURE__ */ jsxs(
    "main",
    {
      style: {
        display: "grid",
        gap: "16px",
        padding: isCompactLayout ? "14px" : "18px",
        color: "inherit",
        width: "100%"
      },
      children: [
        /* @__PURE__ */ jsx(
          "section",
          {
            style: {
              ...cardStyle,
              padding: "18px",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--card, transparent) 90%, transparent))"
            },
            children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "12px" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)" }, children: "Workspace Access" }),
                /* @__PURE__ */ jsx("h1", { style: { margin: 0, fontSize: isCompactLayout ? "24px" : "28px", lineHeight: 1.1 }, children: "Workspace Files" }),
                /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Plugin self-render fallback active while the host slot loader is broken." }),
                projectName ? /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
                  "Project: ",
                  /* @__PURE__ */ jsx("strong", { style: { color: "inherit" }, children: projectName })
                ] }) : null,
                workspaceLabelValue ? /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
                  "Workspace: ",
                  /* @__PURE__ */ jsx("strong", { style: { color: "inherit" }, children: workspaceLabelValue })
                ] }) : null
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }, children: [
                /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
                  /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Project" }),
                  /* @__PURE__ */ jsx("select", { value: projectId ?? "", style: inputStyle, onChange: (event) => setProjectId(event.target.value || null), children: projects.map((project) => /* @__PURE__ */ jsx("option", { value: project.id, children: project.name }, project.id)) })
                ] }),
                /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
                  /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Workspace" }),
                  /* @__PURE__ */ jsx("select", { value: workspaceId ?? "", style: inputStyle, onChange: (event) => setWorkspaceId(event.target.value || null), children: workspaces.map((workspace) => /* @__PURE__ */ jsx("option", { value: workspace.id, children: workspace.label }, workspace.id)) })
                ] })
              ] }),
              error ? /* @__PURE__ */ jsx("div", { style: { ...mutedTextStyle, color: "var(--destructive, #c00)" }, children: error }) : null
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "section",
          {
            style: {
              display: "grid",
              gap: "16px",
              gridTemplateColumns: isCompactLayout ? "minmax(0, 1fr)" : "minmax(260px, 340px) minmax(0, 1fr)",
              alignItems: "start"
            },
            children: [
              /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("strong", { children: "Tree" }),
                  /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Browse the project workspace directly from the plugin bundle." })
                ] }),
                /* @__PURE__ */ jsx(
                  FileTreePanel,
                  {
                    checkedPaths: /* @__PURE__ */ new Set(),
                    emptyDescription: "This workspace does not expose any readable files yet.",
                    emptyTitle: "No files",
                    error,
                    expandedPaths,
                    loading: error === null && (!companyId || !projectId || !workspaceId),
                    nodes,
                    onSelectFile: setSelectedFile,
                    onToggleCheck: () => void 0,
                    onToggleDir: (nextPath) => void handleToggleDir(nextPath),
                    selectedFile
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("strong", { children: fileDisplayName(selectedFile) }),
                  /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: selectedFile ?? "Select a file to preview it." })
                ] }),
                loadingPreview ? /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Loading preview\u2026" }) : preview ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(StandalonePreview, { preview }),
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px" }, children: [
                    /* @__PURE__ */ jsxs("span", { style: mutedTextStyle, children: [
                      "Size: ",
                      formatBytes(preview.sizeBytes)
                    ] }),
                    preview.language ? /* @__PURE__ */ jsxs("span", { style: mutedTextStyle, children: [
                      "Language: ",
                      preview.language
                    ] }) : null,
                    preview.truncated ? /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Preview truncated" }) : null
                  ] })
                ] }) : /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: "Select a file to preview Markdown, code, text, images, or PDFs." })
              ] })
            ]
          }
        )
      ]
    }
  );
}
function findExactTextElement(text) {
  const candidates = Array.from(document.querySelectorAll(
    "div, span, a, p, h1, h2, h3, h4, h5, h6, li, td, th"
  ));
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
  createRoot(mountNode).render(/* @__PURE__ */ jsx(StandaloneWorkspaceBrowser, {}));
}
function replaceSidebarPlaceholderWithLink() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const placeholders = Array.from(document.querySelectorAll("div, span")).filter((element) => element.textContent?.trim() === "Workspace Browser: Workspace Files");
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
      cursor: "pointer"
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
export {
  WorkspaceBrowserPage,
  WorkspaceBrowserTab,
  WorkspaceSidebarLink
};
//# sourceMappingURL=index.js.map
