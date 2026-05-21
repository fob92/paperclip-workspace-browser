import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-workspace-browser",
  apiVersion: 1,
  version: "0.1.7",
  displayName: "Workspace Browser",
  description: "Browse, search, preview, download, and export full Paperclip project workspaces.",
  author: "Felix Oberdorf",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.sidebar.register",
    "ui.page.register",
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
        type: "page",
        id: "workspace-browser-page",
        displayName: "Workspace Files",
        exportName: "WorkspaceBrowserPage",
        routePath: "workspace-files",
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
    launchers: [
      {
        id: "workspace-browser-sidebar-launcher",
        displayName: "Workspace Files",
        placementZone: "sidebar",
        order: 34,
        action: {
          type: "navigate",
          target: "plugins/paperclip-workspace-browser",
        },
      },
    ],
  },
};

export default manifest;
