import { apiCall } from "./transport";
import { dbg, dbgWarn, redactSensitive } from "./utils/debug";
import type {
  TaskRun,
  RunEvent,
  RunArtifact,
  UserSettings,
  AgentSettings,
  DirListing,
  Attachment,
  CliCheckResult,
  ProjectInitStatus,
  CliDistTags,
  UsageOverview,
  BusEvent,
  CliInfo,
  SessionMode,
  TeamSummary,
  TeamConfig,
  TeamTask,
  TeamInboxMessage,
  MarketplacePlugin,
  MarketplaceInfo,
  StandaloneSkill,
  InstalledPlugin,
  PluginOperationResult,
  GitSummary,
  ConfiguredMcpServer,
  McpRegistrySearchResult,
  ProviderHealth,
  ChangelogEntry,
  RemoteTestResult,
  SshKeyInfo,
  PromptSearchResult,
  PromptFavorite,
  SyncResult,
  DiagnosticsReport,
  AgentDefinitionSummary,
} from "./types";

// Runs
export async function listRuns(): Promise<TaskRun[]> {
  dbg("api", "listRuns");
  try {
    const runs = await apiCall<TaskRun[]>("runs/list");
    dbg("api", "listRuns →", runs.length);
    return runs;
  } catch (e) {
    dbgWarn("api", "listRuns error", e);
    throw e;
  }
}

export async function getRun(id: string): Promise<TaskRun> {
  dbg("api", "getRun", id);
  return apiCall<TaskRun>("runs/get", { id });
}

export async function startRun(
  prompt: string,
  cwd: string,
  agent: string,
  model?: string,
  remoteHostName?: string,
  platformId?: string,
): Promise<TaskRun> {
  dbg("api", "startRun", { prompt: prompt.slice(0, 80), agent, cwd, remoteHostName, platformId });
  const result = await apiCall<TaskRun>("runs/start", {
    prompt,
    cwd,
    agent,
    model,
    remote_host_name: remoteHostName ?? null,
    platform_id: platformId ?? null,
  });
  dbg("api", "startRun →", result.id);
  return result;
}

export async function stopRun(id: string): Promise<boolean> {
  dbg("api", "stopRun", id);
  return apiCall<boolean>("runs/stop", { id });
}

export async function renameRun(id: string, name: string): Promise<void> {
  dbg("api", "renameRun", { id, name });
  return apiCall<void>("runs/rename", { id, name });
}

export async function deleteRun(id: string): Promise<void> {
  dbg("api", "deleteRun", { id });
  return apiCall<void>("runs/delete", { id });
}

export async function updateRunModel(id: string, model: string): Promise<void> {
  dbg("api", "updateRunModel", { id, model });
  return apiCall<void>("runs/update-model", { id, model });
}

// Prompt search & favorites

export async function searchPrompts(query: string, limit?: number): Promise<PromptSearchResult[]> {
  dbg("api", "searchPrompts", { query, limit });
  return apiCall<PromptSearchResult[]>("runs/search-prompts", { query, limit });
}

export async function addPromptFavorite(
  runId: string,
  seq: number,
  text: string,
): Promise<PromptFavorite> {
  dbg("api", "addPromptFavorite", { runId, seq });
  const result = await apiCall<PromptFavorite>("runs/add-prompt-favorite", { run_id: runId, seq, text });
  window.dispatchEvent(new Event("ocv:favorites-changed"));
  return result;
}

export async function removePromptFavorite(runId: string, seq: number): Promise<void> {
  dbg("api", "removePromptFavorite", { runId, seq });
  await apiCall<void>("runs/remove-prompt-favorite", { run_id: runId, seq });
  window.dispatchEvent(new Event("ocv:favorites-changed"));
}

export async function updatePromptFavoriteTags(
  runId: string,
  seq: number,
  tags: string[],
): Promise<void> {
  dbg("api", "updatePromptFavoriteTags", { runId, seq, tags });
  await apiCall<void>("runs/update-prompt-favorite-tags", { run_id: runId, seq, tags });
  window.dispatchEvent(new Event("ocv:favorites-changed"));
}

export async function updatePromptFavoriteNote(
  runId: string,
  seq: number,
  note: string,
): Promise<void> {
  dbg("api", "updatePromptFavoriteNote", { runId, seq, note });
  await apiCall<void>("runs/update-prompt-favorite-note", { run_id: runId, seq, note });
  window.dispatchEvent(new Event("ocv:favorites-changed"));
}

export async function listPromptFavorites(): Promise<PromptFavorite[]> {
  dbg("api", "listPromptFavorites");
  return apiCall<PromptFavorite[]>("runs/list-prompt-favorites");
}

export async function listPromptTags(): Promise<string[]> {
  dbg("api", "listPromptTags");
  return apiCall<string[]>("runs/list-prompt-tags");
}

// Chat
export async function sendChatMessage(
  runId: string,
  message: string,
  attachments?: Attachment[],
  model?: string,
): Promise<void> {
  dbg("api", "sendChatMessage", {
    runId,
    msgLen: message.length,
    attachments: attachments?.length ?? 0,
  });
  return apiCall("chat/send", { run_id: runId, message, attachments, model });
}

// CLI sync
export async function syncCliSession(runId: string): Promise<SyncResult> {
  dbg("api", "syncCliSession", { runId });
  return apiCall<SyncResult>("cli-sync/sync", { run_id: runId });
}

// Events
export async function getRunEvents(id: string, sinceSeq?: number): Promise<RunEvent[]> {
  dbg("api", "getRunEvents", { id, sinceSeq });
  return apiCall<RunEvent[]>("events/get", { id, since_seq: sinceSeq });
}

// Artifacts
export async function getRunArtifacts(id: string): Promise<RunArtifact> {
  dbg("api", "getRunArtifacts", id);
  return apiCall<RunArtifact>("artifacts/get", { id });
}

// Settings
export async function getUserSettings(): Promise<UserSettings> {
  dbg("api", "getUserSettings");
  return apiCall<UserSettings>("settings/user/get");
}

export async function updateUserSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  dbg("api", "updateUserSettings");
  return apiCall<UserSettings>("settings/user/update", { patch });
}

export async function getAgentSettings(agent: string): Promise<AgentSettings> {
  dbg("api", "getAgentSettings", agent);
  return apiCall<AgentSettings>("settings/agent/get", { agent });
}

export async function updateAgentSettings(
  agent: string,
  patch: Partial<AgentSettings>,
): Promise<AgentSettings> {
  dbg("api", "updateAgentSettings", agent);
  return apiCall<AgentSettings>("settings/agent/update", { agent, patch });
}

// Filesystem
export async function listDirectory(path: string, showHidden?: boolean): Promise<DirListing> {
  dbg("api", "listDirectory", path, { showHidden });
  return apiCall<DirListing>("fs/list-directory", { path, show_hidden: showHidden });
}

export async function checkIsDirectory(path: string): Promise<boolean> {
  return apiCall<boolean>("fs/check-is-directory", { path });
}

export async function readFileBase64(path: string): Promise<[string, string]> {
  return apiCall<[string, string]>("fs/read-file-base64", { path });
}

// Git
export async function getGitSummary(cwd: string): Promise<GitSummary> {
  dbg("api", "getGitSummary", cwd);
  return apiCall<GitSummary>("git/summary", { cwd });
}

export async function getGitBranch(cwd: string): Promise<string> {
  dbg("api", "getGitBranch", cwd);
  return apiCall<string>("git/branch", { cwd });
}

export async function getGitDiff(cwd: string, staged: boolean, file?: string): Promise<string> {
  dbg("api", "getGitDiff", { cwd, staged, file });
  return apiCall<string>("git/diff", { cwd, staged, file: file ?? null });
}

export async function getGitStatus(cwd: string): Promise<string> {
  dbg("api", "getGitStatus", cwd);
  return apiCall<string>("git/status", { cwd });
}

// Export
export async function exportConversation(runId: string): Promise<string> {
  dbg("api", "exportConversation", runId);
  return apiCall<string>("export/conversation", { run_id: runId });
}

// Memory file candidates
export async function listMemoryFiles(
  cwd?: string,
): Promise<import("./types").MemoryFileCandidate[]> {
  dbg("api", "listMemoryFiles", { cwd });
  return apiCall<import("./types").MemoryFileCandidate[]>("files/list-memory", { cwd: cwd ?? null });
}

// Files
export async function readTextFile(path: string, cwd?: string): Promise<string> {
  dbg("api", "readTextFile", path, { cwd });
  return apiCall<string>("files/read", { path, cwd: cwd ?? null });
}

export async function writeTextFile(path: string, content: string, cwd?: string): Promise<void> {
  dbg("api", "writeTextFile", path, { cwd });
  return apiCall("files/write", { path, content, cwd: cwd ?? null });
}

// Task output
export async function readTaskOutput(path: string): Promise<string> {
  dbg("api", "readTaskOutput", path);
  return apiCall<string>("files/read-task-output", { path });
}

// Stats
export async function getUsageOverview(days?: number): Promise<UsageOverview> {
  dbg("api", "getUsageOverview", { days });
  return apiCall<UsageOverview>("stats/usage", { days: days ?? null });
}

export async function getGlobalUsageOverview(days?: number): Promise<UsageOverview> {
  dbg("api", "getGlobalUsageOverview", { days });
  return apiCall<UsageOverview>("stats/global-usage", { days: days ?? null });
}

export async function clearUsageCache(): Promise<void> {
  dbg("api", "clearUsageCache");
  return apiCall<void>("stats/clear-cache");
}

export async function getHeatmapDaily(
  scope: "app" | "global",
): Promise<import("./types").DailyAggregate[]> {
  dbg("api", "getHeatmapDaily", { scope });
  return apiCall<import("./types").DailyAggregate[]>("stats/heatmap", { scope });
}

// Diagnostics
export async function checkAgentCli(agent: string): Promise<CliCheckResult> {
  dbg("api", "checkAgentCli", agent);
  return apiCall<CliCheckResult>("diagnostics/check-cli", { agent });
}

export async function checkProjectInit(cwd: string): Promise<ProjectInitStatus> {
  dbg("api", "checkProjectInit", cwd);
  return apiCall<ProjectInitStatus>("diagnostics/check-project-init", { cwd });
}

export async function getCliDistTags(): Promise<CliDistTags> {
  dbg("api", "getCliDistTags");
  return apiCall<CliDistTags>("diagnostics/dist-tags");
}

export async function checkSshKey(): Promise<SshKeyInfo> {
  dbg("api", "checkSshKey");
  return apiCall<SshKeyInfo>("diagnostics/check-ssh-key");
}

export async function generateSshKey(): Promise<SshKeyInfo> {
  dbg("api", "generateSshKey");
  return apiCall<SshKeyInfo>("diagnostics/generate-ssh-key");
}

export async function detectLocalProxy(
  proxyId: string,
  baseUrl: string,
): Promise<import("./types").LocalProxyStatus> {
  dbg("api", "detectLocalProxy", { proxyId, baseUrl });
  return apiCall<import("./types").LocalProxyStatus>("diagnostics/detect-proxy", { proxy_id: proxyId, base_url: baseUrl });
}

export async function runDiagnostics(cwd: string): Promise<DiagnosticsReport> {
  dbg("api", "runDiagnostics", { cwd });
  return apiCall<DiagnosticsReport>("diagnostics/run", { cwd });
}

export async function testRemoteHost(
  host: string,
  user: string,
  port?: number,
  keyPath?: string,
  remoteClaudePath?: string,
): Promise<RemoteTestResult> {
  dbg("api", "testRemoteHost", { host, user, port });
  return apiCall<RemoteTestResult>("diagnostics/test-remote", {
    host,
    user,
    port: port ?? null,
    key_path: keyPath ?? null,
    remote_claude_path: remoteClaudePath ?? null,
  });
}

// PTY
export async function spawnPty(runId: string, rows: number, cols: number): Promise<void> {
  dbg("api", "spawnPty", { runId, rows, cols });
  return apiCall("pty/spawn", { run_id: runId, rows, cols });
}

export async function writePty(runId: string, data: string): Promise<void> {
  dbg("api", "writePty", { runId, dataLen: data.length });
  return apiCall("pty/write", { run_id: runId, data });
}

export async function resizePty(runId: string, rows: number, cols: number): Promise<void> {
  dbg("api", "resizePty", { runId, rows, cols });
  return apiCall("pty/resize", { run_id: runId, rows, cols });
}

// CLI Control Protocol
export async function getCliInfo(forceRefresh?: boolean): Promise<CliInfo> {
  dbg("api", "getCliInfo", { forceRefresh });
  try {
    const info = await apiCall<CliInfo>("control/cli-info", { force_refresh: forceRefresh });
    dbg("api", "getCliInfo →", { models: info.models.length });
    return info;
  } catch (e) {
    dbgWarn("api", "getCliInfo error", e);
    throw e;
  }
}

// Session (event bus)
export async function startSession(
  runId: string,
  mode?: SessionMode,
  sessionId?: string,
  initialMessage?: string,
  attachments?: Array<{ content_base64: string; media_type: string; filename: string }>,
  platformId?: string,
): Promise<void> {
  dbg("api", "startSession", {
    runId,
    mode,
    sessionId,
    hasMessage: !!initialMessage,
    attachments: attachments?.length ?? 0,
    platformId,
  });
  return apiCall("session/start", {
    run_id: runId,
    mode,
    session_id: sessionId,
    initial_message: initialMessage,
    attachments: attachments ?? null,
    platform_id: platformId ?? null,
  });
}

export async function sendSessionMessage(
  runId: string,
  message: string,
  attachments?: Array<{ content_base64: string; media_type: string; filename: string }>,
): Promise<void> {
  dbg("api", "sendSessionMessage", {
    runId,
    msgLen: message.length,
    attachments: attachments?.length ?? 0,
  });
  return apiCall("session/message", {
    run_id: runId,
    message,
    attachments: attachments ?? null,
  });
}

export async function sendSessionControl(
  runId: string,
  subtype: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  dbg("api", "sendSessionControl", { runId, subtype, params });
  try {
    const result = await apiCall<Record<string, unknown>>("session/control", {
      run_id: runId,
      subtype,
      params: params ?? null,
    });
    dbg("api", "sendSessionControl →", result);
    return result;
  } catch (e) {
    dbgWarn("api", "sendSessionControl error", e);
    throw e;
  }
}

export async function stopSession(runId: string): Promise<void> {
  dbg("api", "stopSession", runId);
  return apiCall("session/stop", { run_id: runId });
}

export interface LoadRunDataResult {
  run: TaskRun;
  busEvents: BusEvent[];
}

export async function loadRunData(id: string, syncCli = false): Promise<LoadRunDataResult> {
  dbg("api", "loadRunData", { id, syncCli });
  // Composite call: load_run_data doesn't exist as a single backend endpoint.
  // Combine get_run + get_bus_events.
  const [run, busEvents] = await Promise.all([
    apiCall<TaskRun>("runs/get", { id }),
    apiCall<BusEvent[]>("session/bus-events", { id }),
  ]);
  if (syncCli) {
    try {
      await apiCall("cli-sync/sync", { run_id: id });
    } catch {
      // best-effort
    }
  }
  return { run, busEvents };
}

export async function getBusEvents(id: string, sinceSeq?: number): Promise<BusEvent[]> {
  dbg("api", "getBusEvents", { id, sinceSeq });
  return apiCall<BusEvent[]>("session/bus-events", { id, since_seq: sinceSeq });
}

export async function getToolResult(
  runId: string,
  toolUseId: string,
): Promise<Record<string, unknown> | null> {
  dbg("api", "getToolResult", { runId, toolUseId });
  // TODO: Backend route not yet implemented. Return null for now.
  return null;
}

export async function forkSession(runId: string): Promise<string> {
  dbg("api", "forkSession", { runId });
  return apiCall<string>("session/fork", { run_id: runId });
}

export async function approveSessionTool(runId: string, toolName: string): Promise<void> {
  dbg("api", "approveSessionTool", { runId, toolName });
  return apiCall("session/approve-tool", { run_id: runId, tool_name: toolName });
}

export async function respondPermission(
  runId: string,
  requestId: string,
  behavior: string,
  updatedPermissions?: import("./types").PermissionSuggestion[],
  updatedInput?: Record<string, unknown>,
  denyMessage?: string,
  interrupt?: boolean,
): Promise<void> {
  dbg("api", "respondPermission", {
    runId,
    requestId,
    behavior,
    updatedPermissions,
    updatedInput,
    denyMessage,
    interrupt,
  });
  return apiCall("session/respond-permission", {
    run_id: runId,
    request_id: requestId,
    behavior,
    updated_permissions: updatedPermissions ?? null,
    updated_input: updatedInput ?? null,
    deny_message: denyMessage ?? null,
    interrupt: interrupt ?? null,
  });
}

export async function respondHookCallback(
  runId: string,
  requestId: string,
  decision: "allow" | "deny",
): Promise<void> {
  dbg("api", "respondHookCallback", { runId, requestId, decision });
  return apiCall("session/respond-hook-callback", { run_id: runId, request_id: requestId, decision });
}

// ── Typed control request wrappers ──

export async function setSessionModel(runId: string, model: string) {
  return sendSessionControl(runId, "set_model", { model });
}

export async function interruptSession(runId: string) {
  return sendSessionControl(runId, "interrupt");
}

export async function setPermissionMode(runId: string, mode: string) {
  return sendSessionControl(runId, "set_permission_mode", { mode });
}

export async function setMaxThinkingTokens(runId: string, tokens: number) {
  return sendSessionControl(runId, "set_max_thinking_tokens", { max_thinking_tokens: tokens });
}

export async function getMcpStatus(runId: string) {
  return sendSessionControl(runId, "get_mcp_status");
}

export async function setMcpServers(runId: string, servers: Record<string, unknown>) {
  return sendSessionControl(runId, "set_mcp_servers", { servers });
}

export async function reconnectMcpServer(runId: string, serverName: string) {
  return sendSessionControl(runId, "reconnect_mcp_server", { server_name: serverName });
}

export async function toggleMcpServer(runId: string, serverName: string, enabled: boolean) {
  return sendSessionControl(runId, "toggle_mcp_server", { server_name: serverName, enabled });
}

export async function toggleMcpServerConfig(
  serverName: string,
  enabled: boolean,
  scope: string,
  cwd?: string,
): Promise<{ success: boolean; message: string }> {
  dbg("api", "toggleMcpServerConfig", { serverName, enabled, scope, cwd });
  return apiCall("mcp/toggle", {
    name: serverName,
    enabled,
    scope,
    cwd: cwd ?? null,
  });
}

export async function rewindFiles(
  runId: string,
  opts: { userMessageId: string; dryRun?: boolean; files?: string[] },
) {
  return sendSessionControl(runId, "rewind_files", {
    user_message_id: opts.userMessageId,
    ...(opts.dryRun ? { dry_run: true } : {}),
    ...(opts.files ? { files: opts.files } : {}),
  });
}

export async function cancelControlRequest(runId: string, requestId: string) {
  dbg("api", "cancelControlRequest", { runId, requestId });
  return apiCall("session/cancel-control-request", { run_id: runId, request_id: requestId });
}

// ── Teams ──

export async function listTeams(): Promise<TeamSummary[]> {
  dbg("api", "listTeams");
  return apiCall<TeamSummary[]>("teams/list");
}

export async function getTeamConfig(name: string): Promise<TeamConfig> {
  dbg("api", "getTeamConfig", name);
  return apiCall<TeamConfig>("teams/config", { name });
}

export async function listTeamTasks(teamName: string): Promise<TeamTask[]> {
  dbg("api", "listTeamTasks", teamName);
  return apiCall<TeamTask[]>("teams/tasks", { team_name: teamName });
}

export async function getTeamTask(teamName: string, taskId: string): Promise<TeamTask> {
  dbg("api", "getTeamTask", { teamName, taskId });
  return apiCall<TeamTask>("teams/task", { team_name: teamName, task_id: taskId });
}

export async function getTeamInbox(
  teamName: string,
  agentName: string,
): Promise<TeamInboxMessage[]> {
  dbg("api", "getTeamInbox", { teamName, agentName });
  return apiCall<TeamInboxMessage[]>("teams/inbox", { team_name: teamName, agent_name: agentName });
}

export async function getAllTeamInboxes(name: string): Promise<TeamInboxMessage[]> {
  dbg("api", "getAllTeamInboxes", name);
  return apiCall<TeamInboxMessage[]>("teams/all-inboxes", { name });
}

export async function deleteTeam(name: string): Promise<void> {
  dbg("api", "deleteTeam", name);
  return apiCall<void>("teams/delete", { name });
}

// ── Clipboard ──

export interface ClipboardFileInfo {
  path: string;
  name: string;
  size: number;
  mime_type: string;
}

export interface ClipboardFileContent {
  content_base64: string;
  content_text: string | null;
}

export async function getClipboardFiles(): Promise<ClipboardFileInfo[]> {
  dbg("api", "getClipboardFiles");
  return apiCall<ClipboardFileInfo[]>("clipboard/files");
}

export async function readClipboardFile(
  path: string,
  asText: boolean,
): Promise<ClipboardFileContent> {
  dbg("api", "readClipboardFile", { path, asText });
  return apiCall<ClipboardFileContent>("clipboard/read", { path, as_text: asText });
}

/** Save file to temp directory, return filesystem path. For >20MB PDFs from drag-drop/file picker. */
export async function saveTempAttachment(name: string, contentBase64: string): Promise<string> {
  dbg("api", "saveTempAttachment", { name, len: contentBase64.length });
  return apiCall<string>("clipboard/save-temp", { name, content_base64: contentBase64 });
}

// ── Plugins ──

export async function listMarketplaces(): Promise<MarketplaceInfo[]> {
  dbg("api", "listMarketplaces");
  return apiCall<MarketplaceInfo[]>("plugins/list-marketplaces");
}

export async function listMarketplacePlugins(): Promise<MarketplacePlugin[]> {
  dbg("api", "listMarketplacePlugins");
  return apiCall<MarketplacePlugin[]>("plugins/list-marketplace-plugins");
}

export async function listStandaloneSkills(cwd?: string): Promise<StandaloneSkill[]> {
  dbg("api", "listStandaloneSkills", { cwd });
  return apiCall<StandaloneSkill[]>("plugins/list-standalone-skills", { cwd: cwd ?? null });
}

export async function getSkillContent(path: string, cwd?: string): Promise<string> {
  dbg("api", "getSkillContent", path);
  return apiCall<string>("plugins/get-skill-content", { path, cwd: cwd ?? "" });
}

export async function createSkill(
  name: string,
  description: string,
  content: string,
  scope: string,
  cwd?: string,
): Promise<StandaloneSkill> {
  dbg("api", "createSkill", { name, scope, cwd });
  return apiCall<StandaloneSkill>("plugins/create-skill", {
    name,
    description,
    content,
    scope,
    cwd: cwd ?? null,
  });
}

export async function updateSkill(path: string, content: string, cwd?: string): Promise<void> {
  dbg("api", "updateSkill", { path, cwd });
  return apiCall<void>("plugins/update-skill", { path, content, cwd: cwd ?? null });
}

export async function deleteSkill(path: string, cwd?: string): Promise<void> {
  dbg("api", "deleteSkill", { path, cwd });
  return apiCall<void>("plugins/delete-skill", { path, cwd: cwd ?? null });
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  dbg("api", "listInstalledPlugins");
  return apiCall<InstalledPlugin[]>("plugins/list-installed");
}

export async function installPlugin(name: string, scope: string): Promise<PluginOperationResult> {
  dbg("api", "installPlugin", { name, scope });
  return apiCall<PluginOperationResult>("plugins/install", { name, scope });
}

export async function uninstallPlugin(name: string, scope: string): Promise<PluginOperationResult> {
  dbg("api", "uninstallPlugin", { name, scope });
  return apiCall<PluginOperationResult>("plugins/uninstall", { name, scope });
}

export async function enablePlugin(name: string, scope: string): Promise<PluginOperationResult> {
  dbg("api", "enablePlugin", { name, scope });
  return apiCall<PluginOperationResult>("plugins/enable", { name, scope });
}

export async function disablePlugin(name: string, scope: string): Promise<PluginOperationResult> {
  dbg("api", "disablePlugin", { name, scope });
  return apiCall<PluginOperationResult>("plugins/disable", { name, scope });
}

export async function updatePlugin(name: string, scope: string): Promise<PluginOperationResult> {
  dbg("api", "updatePlugin", { name, scope });
  return apiCall<PluginOperationResult>("plugins/update", { name, scope });
}

export async function addMarketplace(source: string): Promise<PluginOperationResult> {
  dbg("api", "addMarketplace", { source });
  return apiCall<PluginOperationResult>("plugins/add-marketplace", { source });
}

export async function removeMarketplace(name: string): Promise<PluginOperationResult> {
  dbg("api", "removeMarketplace", { name });
  return apiCall<PluginOperationResult>("plugins/remove-marketplace", { name });
}

export async function updateMarketplace(name?: string): Promise<PluginOperationResult> {
  dbg("api", "updateMarketplace", { name });
  return apiCall<PluginOperationResult>("plugins/update-marketplace", { name: name ?? null });
}

// ── Community Skills ──

export async function checkCommunityHealth(): Promise<import("./types").ProviderHealth> {
  dbg("api", "checkCommunityHealth");
  return apiCall<import("./types").ProviderHealth>("plugins/community-health");
}

export async function searchCommunitySkills(
  query: string,
  limit?: number,
): Promise<import("./types").CommunitySkillResult[]> {
  dbg("api", "searchCommunitySkills", { query, limit });
  return apiCall<import("./types").CommunitySkillResult[]>("plugins/community-search", {
    query,
    limit: limit ?? null,
  });
}

export async function getCommunitySkillDetail(
  source: string,
  skillId: string,
): Promise<import("./types").CommunitySkillDetail> {
  dbg("api", "getCommunitySkillDetail", { source, skillId });
  return apiCall<import("./types").CommunitySkillDetail>("plugins/community-detail", {
    source,
    skill_id: skillId,
  });
}

export async function installCommunitySkill(
  source: string,
  skillId: string,
  scope: string,
  cwd?: string,
): Promise<PluginOperationResult> {
  dbg("api", "installCommunitySkill", { source, skillId, scope });
  return apiCall<PluginOperationResult>("plugins/community-install", {
    source,
    skill_id: skillId,
    scope,
    cwd: cwd ?? null,
  });
}

// ── MCP Registry ──

export async function listConfiguredMcpServers(cwd?: string): Promise<ConfiguredMcpServer[]> {
  dbg("api", "listConfiguredMcpServers", { cwd });
  return apiCall<ConfiguredMcpServer[]>("mcp/list", { cwd: cwd ?? null });
}

export async function addMcpServer(
  name: string,
  transport: string,
  scope: string,
  cwd?: string,
  configJson?: string,
  url?: string,
  envVars?: Record<string, string>,
  headers?: Record<string, string>,
): Promise<PluginOperationResult> {
  dbg("api", "addMcpServer", { name, transport, scope });
  return apiCall<PluginOperationResult>("mcp/add", {
    name,
    transport,
    scope,
    cwd: cwd ?? null,
    config_json: configJson ?? null,
    url: url ?? null,
    env_vars: envVars ?? null,
    headers: headers ?? null,
  });
}

export async function removeMcpServer(
  name: string,
  scope: string,
  cwd?: string,
): Promise<PluginOperationResult> {
  dbg("api", "removeMcpServer", { name, scope, cwd });
  return apiCall<PluginOperationResult>("mcp/remove", {
    name,
    scope,
    cwd: cwd ?? null,
  });
}

export async function checkMcpRegistryHealth(): Promise<ProviderHealth> {
  dbg("api", "checkMcpRegistryHealth");
  return apiCall<ProviderHealth>("mcp/registry-health");
}

export async function searchMcpRegistry(
  query: string,
  limit?: number,
  cursor?: string,
): Promise<McpRegistrySearchResult> {
  dbg("api", "searchMcpRegistry", { query, limit, cursor });
  return apiCall<McpRegistrySearchResult>("mcp/registry-search", {
    query,
    limit: limit ?? null,
    cursor: cursor ?? null,
  });
}

// ── CLI Config ──

export async function getCliConfig(): Promise<Record<string, unknown>> {
  dbg("api", "getCliConfig");
  return apiCall<Record<string, unknown>>("cli-config/get");
}

export async function getProjectCliConfig(cwd: string): Promise<Record<string, unknown>> {
  dbg("api", "getProjectCliConfig", { cwd });
  return apiCall<Record<string, unknown>>("cli-config/project", { cwd });
}

export async function updateCliConfig(
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  dbg("api", "updateCliConfig", { patch: redactSensitive(patch) });
  return apiCall<Record<string, unknown>>("cli-config/update", { patch });
}

// ── App Updates ──

export async function checkForUpdates(): Promise<import("./types").UpdateInfo> {
  dbg("api", "checkForUpdates");
  return apiCall<import("./types").UpdateInfo>("updates/check");
}

// ── Changelog ──

export async function getChangelog(): Promise<ChangelogEntry[]> {
  dbg("api", "getChangelog");
  return apiCall<ChangelogEntry[]>("stats/changelog");
}

// ── Onboarding ──

export async function checkAuthStatus(): Promise<import("./types").AuthCheckResult> {
  dbg("api", "checkAuthStatus");
  return apiCall<import("./types").AuthCheckResult>("onboarding/auth-status");
}

export async function detectInstallMethods(): Promise<import("./types").InstallMethod[]> {
  dbg("api", "detectInstallMethods");
  return apiCall<import("./types").InstallMethod[]>("onboarding/install-methods");
}

export async function runClaudeLogin(): Promise<boolean> {
  dbg("api", "runClaudeLogin");
  return apiCall<boolean>("onboarding/login");
}

export async function getAuthOverview(): Promise<import("./types").AuthOverview> {
  dbg("api", "getAuthOverview");
  return apiCall<import("./types").AuthOverview>("onboarding/auth-overview");
}

export async function setCliApiKey(key: string): Promise<void> {
  dbg("api", "setCliApiKey");
  return apiCall<void>("onboarding/set-api-key", { key });
}

export async function removeCliApiKey(): Promise<void> {
  dbg("api", "removeCliApiKey");
  return apiCall<void>("onboarding/remove-api-key");
}

// ── Screenshot ──

export async function captureScreenshot(): Promise<void> {
  dbg("api", "captureScreenshot");
  // Not available in web mode
  throw new Error("Screenshot capture is not available in web mode");
}

export async function updateScreenshotHotkey(hotkey: string | null): Promise<void> {
  dbg("api", "updateScreenshotHotkey", { hotkey });
  // Not available in web mode
  throw new Error("Screenshot hotkeys are not available in web mode");
}

// ── Agents ──

export async function listAgents(cwd?: string): Promise<AgentDefinitionSummary[]> {
  dbg("api", "listAgents", { cwd });
  return apiCall<AgentDefinitionSummary[]>("agents/list", { cwd: cwd ?? null });
}

export async function readAgentFile(
  scope: "user" | "project",
  fileName: string,
  cwd?: string,
): Promise<string> {
  dbg("api", "readAgentFile", { scope, fileName });
  return apiCall<string>("agents/read", {
    scope,
    file_name: fileName,
    cwd: cwd ?? null,
  });
}

export async function createAgentFile(
  scope: "user" | "project",
  fileName: string,
  content: string,
  cwd?: string,
): Promise<void> {
  dbg("api", "createAgentFile", { scope, fileName });
  return apiCall<void>("agents/create", {
    scope,
    file_name: fileName,
    content,
    cwd: cwd ?? null,
  });
}

export async function updateAgentFile(
  scope: "user" | "project",
  fileName: string,
  content: string,
  cwd?: string,
): Promise<void> {
  dbg("api", "updateAgentFile", { scope, fileName });
  return apiCall<void>("agents/update", {
    scope,
    file_name: fileName,
    content,
    cwd: cwd ?? null,
  });
}

export async function deleteAgentFile(
  scope: "user" | "project",
  fileName: string,
  cwd?: string,
): Promise<void> {
  dbg("api", "deleteAgentFile", { scope, fileName });
  return apiCall<void>("agents/delete", {
    scope,
    file_name: fileName,
    cwd: cwd ?? null,
  });
}
