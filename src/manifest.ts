import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-workspace-browser",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Workspace Browser",
  description: "Browse, search, preview, download, and export full Paperclip project workspaces.",
  author: "Felix Oberdorf",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.sidebar.register",
    "ui.page.register",
    "projects.read",
    "project.workspaces.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "workspace-browser-sidebar-link",
        displayName: "Workspace Files",
        exportName: "WorkspaceSidebarLink",
        order: 34,
      },
      {
        type: "page",
        id: "workspace-browser-page",
        displayName: "Workspace Files",
        exportName: "WorkspaceBrowserPage",
        routePath: "workspace-files",
      },
      {
        type: "projectSidebarItem",
        id: "workspace-browser-project-link",
        displayName: "Workspace Files",
        exportName: "ProjectWorkspaceFilesLink",
        entityTypes: ["project"],
        order: 12,
      },
    ],
  },
};

export default manifest;
