# Paperclip Workspace Browser

`paperclip-workspace-browser` adds a real workspace file browser to Paperclip.

It gives each company a `/workspace-files` page with:

- project picker plus primary-workspace fallback
- lazy file tree for any project workspace
- filename and content search
- previews for Markdown, code/text, and images
- file download, workspace/selection ZIP export, and quick terminal command copying

## Install in Paperclip

1. Open `Instance Settings -> Plugins`.
2. Click `Install Plugin`.
3. Enter `paperclip-workspace-browser`.
4. Open the new `Workspace Files` item in the company sidebar.

The page route is `/:companyPrefix/workspace-files`.

## Local development

```bash
npm install
npm run validate
```

## Notes

- The plugin reads workspace paths from `ctx.projects.listWorkspaces()` / `ctx.projects.getPrimaryWorkspace()`.
- File and ZIP transfers stay inside the plugin worker and are returned to the UI as JSON-safe base64 payloads because current Paperclip plugin API routes are JSON-only.
- "Open in terminal" currently copies a ready-to-run `cd ...` command. The current Paperclip alpha runtime does not expose a native terminal surface for third-party plugins yet.
