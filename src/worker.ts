import type { Project, PluginWorkspace } from "@paperclipai/plugin-sdk";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import {
  buildFileDownload,
  buildTerminalCommand,
  buildZipDownload,
  listDirectory,
  readFilePreview,
  sanitizeWorkspacePath,
  searchWorkspace,
  workspaceLabel,
} from "./filesystem.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = readString(params[key]);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function projectSummary(project: Project) {
  return {
    id: project.id,
    name: project.name,
    status: project.status ?? null,
  };
}

function workspaceSummary(workspace: PluginWorkspace) {
  return {
    id: workspace.id,
    projectId: workspace.projectId,
    name: workspace.name,
    path: sanitizeWorkspacePath(workspace.path),
    label: workspaceLabel(workspace),
    isPrimary: workspace.isPrimary,
  };
}

async function resolveWorkspace(
  ctx: Parameters<Parameters<typeof definePlugin>[0]["setup"]>[0],
  params: Record<string, unknown>,
): Promise<{ companyId: string; projectId: string; workspace: PluginWorkspace }> {
  const companyId = requireString(params, "companyId");
  const projectId = requireString(params, "projectId");
  const workspaceId = readString(params.workspaceId);

  if (workspaceId) {
    const workspaces = await ctx.projects.listWorkspaces(projectId, companyId);
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    return { companyId, projectId, workspace };
  }

  const primaryWorkspace = await ctx.projects.getPrimaryWorkspace(projectId, companyId);
  if (primaryWorkspace) {
    return { companyId, projectId, workspace: primaryWorkspace };
  }

  const workspaces = await ctx.projects.listWorkspaces(projectId, companyId);
  if (workspaces.length === 0) {
    throw new Error("Project has no workspaces");
  }
  return { companyId, projectId, workspace: workspaces[0]! };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("workspace-browser plugin setup");

    ctx.data.register("projects", async (params) => {
      const companyId = requireString(params, "companyId");
      const projects = await ctx.projects.list({ companyId, limit: 500, offset: 0 });
      return projects
        .map(projectSummary)
        .sort((left, right) => left.name.localeCompare(right.name));
    });

    ctx.data.register("project-workspaces", async (params) => {
      const companyId = readString(params.companyId);
      const projectId = readString(params.projectId);
      if (!companyId || !projectId) {
        return [];
      }
      const workspaces = await ctx.projects.listWorkspaces(projectId, companyId);
      return workspaces.map(workspaceSummary);
    });

    async function loadFileList(params: Record<string, unknown>) {
      if (!readString(params.companyId) || !readString(params.projectId)) {
        return { entries: [] };
      }
      const { workspace } = await resolveWorkspace(ctx, params);
      const directoryPath = readString(params.directoryPath);
      const entries = await listDirectory(workspace.path, directoryPath);
      return { entries };
    }

    ctx.data.register("file-list", loadFileList);
    ctx.actions.register("load-file-list", loadFileList);

    ctx.data.register("file-preview", async (params) => {
      if (!readString(params.companyId) || !readString(params.projectId) || !readString(params.filePath)) {
        return null;
      }
      const { workspace } = await resolveWorkspace(ctx, params);
      const filePath = requireString(params, "filePath");
      return await readFilePreview(workspace.path, filePath);
    });

    ctx.actions.register("search-workspace", async (params) => {
      const { workspace } = await resolveWorkspace(ctx, params);
      const query = requireString(params, "query");
      const mode = readString(params.mode) || "both";
      return await searchWorkspace(
        workspace.path,
        query,
        mode === "path" || mode === "content" ? mode : "both",
      );
    });

    ctx.actions.register("download-file", async (params) => {
      const { workspace } = await resolveWorkspace(ctx, params);
      const filePath = requireString(params, "filePath");
      return await buildFileDownload(workspace.path, filePath);
    });

    ctx.actions.register("download-zip", async (params) => {
      const { workspace, projectId } = await resolveWorkspace(ctx, params);
      const requestedPaths = Array.isArray(params.paths)
        ? params.paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const archiveBaseName = readString(params.archiveBaseName)
        || `workspace-${workspace.id}-${projectId.slice(0, 8)}`;
      return await buildZipDownload(workspace.path, requestedPaths, archiveBaseName);
    });

    ctx.actions.register("terminal-command", async (params) => {
      const { workspace } = await resolveWorkspace(ctx, params);
      const targetPath = readString(params.targetPath) || undefined;
      return {
        command: await buildTerminalCommand(workspace.path, targetPath),
      };
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: "workspace-browser ready",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
