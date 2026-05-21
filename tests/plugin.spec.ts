import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const tempRoots: string[] = [];

async function createWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-workspace-browser-plugin-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await fs.writeFile(path.join(root, "reports", "summary.md"), "# Generated report\n", "utf8");
  await fs.writeFile(path.join(root, "artifact.txt"), "artifact body\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("workspace browser plugin", () => {
  it("declares the expected sidebar launcher, page, and detail tab surfaces", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "ui.sidebar.register",
      "ui.page.register",
      "ui.detailTab.register",
      "projects.read",
      "project.workspaces.read",
    ]));
    expect(manifest.ui?.launchers).toContainEqual(expect.objectContaining({
      placementZone: "sidebar",
      displayName: "Workspace Files",
      action: expect.objectContaining({
        type: "navigate",
        target: "plugins/paperclip-workspace-browser",
      }),
    }));
    expect(manifest.ui?.slots).toContainEqual(expect.objectContaining({
      type: "page",
      routePath: "workspace-files",
    }));
    expect(manifest.ui?.slots).toContainEqual(expect.objectContaining({
      type: "detailTab",
      entityTypes: ["project"],
    }));
    expect(manifest.ui?.slots).not.toContainEqual(expect.objectContaining({
      type: "sidebar",
    }));
    expect(manifest.ui?.slots).not.toContainEqual(expect.objectContaining({
      type: "projectSidebarItem",
    }));
  });

  it("lists workspaces, previews files, searches content, and builds zip exports", async () => {
    const root = await createWorkspace();
    const workspaceRecord = {
      id: "workspace-1",
      projectId: "project-1",
      name: "Primary",
      path: root,
      repoUrl: null,
      repoRef: "main",
      defaultRef: "main",
      isPrimary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const harness = createTestHarness({ manifest });
    harness.ctx.projects.list = async () => [{
      id: "project-1",
      companyId: "company-1",
      name: "Workspace Project",
      description: null,
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }] as any;
    harness.ctx.projects.listWorkspaces = async () => [workspaceRecord];
    harness.ctx.projects.getPrimaryWorkspace = async () => workspaceRecord;

    await plugin.definition.setup(harness.ctx);

    await expect(harness.getData("projects", { companyId: "company-1" })).resolves.toEqual([
      expect.objectContaining({ id: "project-1", name: "Workspace Project" }),
    ]);

    await expect(harness.getData("project-workspaces", {
      companyId: "company-1",
      projectId: "project-1",
    })).resolves.toEqual([
      expect.objectContaining({ id: "workspace-1", isPrimary: true }),
    ]);

    await expect(harness.getData("file-list", {
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      directoryPath: "reports",
    })).resolves.toEqual({
      entries: [expect.objectContaining({ path: "reports/summary.md", isDirectory: false })],
    });

    await expect(harness.getData("file-preview", {
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      filePath: "reports/summary.md",
    })).resolves.toEqual(expect.objectContaining({
      kind: "markdown",
      path: "reports/summary.md",
    }));

    const searchResult = await harness.performAction("search-workspace", {
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      query: "report",
      mode: "both",
    }) as { results: Array<{ path: string }> };
    expect(searchResult.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "reports/summary.md" }),
    ]));

    const zipResult = await harness.performAction("download-zip", {
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      paths: ["reports"],
      archiveBaseName: "reports-only",
    }) as { fileName: string; base64: string };
    expect(zipResult.fileName).toBe("reports-only.zip");
    expect(Buffer.from(zipResult.base64, "base64").byteLength).toBeGreaterThan(0);
  });

  it("surfaces and resolves the managed primary workspace when no explicit workspace rows exist", async () => {
    const root = await createWorkspace();
    const managedWorkspaceRecord = {
      id: "project-1:managed",
      projectId: "project-1",
      name: "Managed Primary",
      path: root,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      isPrimary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const harness = createTestHarness({ manifest });
    harness.ctx.projects.listWorkspaces = async () => [];
    harness.ctx.projects.getPrimaryWorkspace = async () => managedWorkspaceRecord;

    await plugin.definition.setup(harness.ctx);

    await expect(harness.getData("project-workspaces", {
      companyId: "company-1",
      projectId: "project-1",
    })).resolves.toEqual([
      expect.objectContaining({ id: "project-1:managed", isPrimary: true, path: root }),
    ]);

    await expect(harness.getData("file-list", {
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "project-1:managed",
      directoryPath: "",
    })).resolves.toEqual({
      entries: expect.arrayContaining([
        expect.objectContaining({ path: "artifact.txt", isDirectory: false }),
        expect.objectContaining({ path: "reports", isDirectory: true }),
      ]),
    });
  });
});
