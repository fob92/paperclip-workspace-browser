# Paperclip Workspace Browser

`paperclip-workspace-browser` adds a real workspace file browser to Paperclip.

It adds a project-scoped `Workspace Files` entry plus a dedicated project detail tab with:

- primary-workspace fallback with explicit workspace switching
- lazy file tree for the current project workspace
- filename and content search
- previews for Markdown, code/text, and images
- file download, workspace/selection ZIP export, and quick terminal command copying

## Install in Paperclip

1. Open `Instance Settings -> Plugins`.
2. Click `Install Plugin`.
3. Enter `paperclip-workspace-browser`.
4. Open any project in the sidebar.
5. Click the new `Workspace Files` item under that project or open the `Workspace Files` tab inside the project detail page.

## Local development

```bash
npm install
npm run validate
```

## Notes

- The plugin reads workspace paths from `ctx.projects.listWorkspaces()` / `ctx.projects.getPrimaryWorkspace()`.
- File and ZIP transfers stay inside the plugin worker and are returned to the UI as JSON-safe base64 payloads because current Paperclip plugin API routes are JSON-only.
- "Open in terminal" currently copies a ready-to-run `cd ...` command. The current Paperclip alpha runtime does not expose a native terminal surface for third-party plugins yet.
- This plugin intentionally uses `projectSidebarItem + detailTab` instead of a company-level plugin page because that path is the most reliable on currently deployed Paperclip builds.
