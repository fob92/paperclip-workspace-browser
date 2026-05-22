const manifest = {
    id: "paperclip-workspace-browser",
    apiVersion: 1,
    version: "0.1.9",
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
//# sourceMappingURL=manifest.js.map