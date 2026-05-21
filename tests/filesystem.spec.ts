import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildFileDownload,
  buildTerminalCommand,
  buildZipDownload,
  readFilePreview,
  resolveWorkspacePath,
  searchWorkspace,
} from "../src/filesystem.js";

const tempRoots: string[] = [];

async function createWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-workspace-browser-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "# Hello Workspace\n\npreviewable markdown\n", "utf8");
  await fs.writeFile(path.join(root, "src", "index.ts"), "export const value = 'workspace browser';\n", "utf8");
  await fs.writeFile(path.join(root, "docs", "notes.txt"), "search needle inside this text file\n", "utf8");
  await fs.writeFile(path.join(root, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
  await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("workspace filesystem helpers", () => {
  it("blocks path traversal outside the workspace root", () => {
    expect(resolveWorkspacePath("/tmp/workspace", "../secret.txt")).toBeNull();
    expect(resolveWorkspacePath("/tmp/workspace", "src/index.ts")).toBe("/tmp/workspace/src/index.ts");
  });

  it("reads markdown, image, and binary previews", async () => {
    const workspace = await createWorkspace();

    const markdown = await readFilePreview(workspace, "README.md");
    expect(markdown).toMatchObject({
      kind: "markdown",
      name: "README.md",
      truncated: false,
    });
    expect(markdown.content).toContain("previewable markdown");

    const image = await readFilePreview(workspace, "pixel.png");
    expect(image.kind).toBe("image");
    expect(image.imageDataUrl).toContain("data:image/png;base64,");

    const binary = await readFilePreview(workspace, "binary.bin");
    expect(binary.kind).toBe("binary");
    expect(binary.content).toBeNull();
  });

  it("finds matches in paths and file contents", async () => {
    const workspace = await createWorkspace();

    const byPath = await searchWorkspace(workspace, "readme", "path");
    expect(byPath.results).toContainEqual(expect.objectContaining({
      path: "README.md",
      matchedBy: "path",
    }));

    const byContent = await searchWorkspace(workspace, "needle", "both");
    expect(byContent.results).toContainEqual(expect.objectContaining({
      path: "docs/notes.txt",
      matchedBy: "content",
    }));
  });

  it("builds file downloads, zip exports, and terminal commands", async () => {
    const workspace = await createWorkspace();

    const download = await buildFileDownload(workspace, "README.md");
    expect(download.fileName).toBe("README.md");
    expect(Buffer.from(download.base64, "base64").toString("utf8")).toContain("# Hello Workspace");

    const zipPayload = await buildZipDownload(workspace, ["docs", "README.md"], "workspace-export");
    expect(zipPayload.fileName).toBe("workspace-export.zip");
    const archive = await JSZip.loadAsync(Buffer.from(zipPayload.base64, "base64"));
    const readme = await archive.file("README.md")?.async("string");
    const notes = await archive.file("docs/notes.txt")?.async("string");
    expect(readme).toContain("Hello Workspace");
    expect(notes).toContain("needle");

    const command = await buildTerminalCommand(workspace, "src/index.ts");
    expect(command).toContain(path.join(workspace, "src"));
  });
});
