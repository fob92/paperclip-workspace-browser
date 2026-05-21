import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-workspace-browser",
  apiVersion: 1,
  version: "0.1.4",
  displayName: "Workspace Browser",
  description: "Browse, search, preview, download, and export full Paperclip project workspaces.",
  author: "Felix Oberdorf",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.sidebar.register",
    "ui.detailTab.register",
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
        type: "projectSidebarItem",
        id: "workspace-browser-project-link",
        displayName: "Workspace Files",
        exportName: "WorkspaceProjectFilesLink",
        entityTypes: ["project"],
        order: 34,
      },
      {
        type: "detailTab",
        id: "workspace-browser-project-tab",
        displayName: "Workspace Files",
        exportName: "WorkspaceBrowserTab",
        entityTypes: ["project"],
        order: 34,
      },
    ],
  },
};

export default manifest;
