<script lang="ts">
  import { onMount } from "svelte";
  import { getGitSummary } from "$lib/api";
  import type { GitSummary, TaskRun } from "$lib/types";
  import { formatTokenCount, formatCost, cwdDisplayLabel, getContextWindowForModel } from "$lib/utils/format";

  interface Props {
    model: string;
    cwd: string;
    run?: TaskRun | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    contextWindow: number;
    contextUtilization: number;
    durationMs: number;
  }

  let {
    model,
    cwd,
    run = null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost,
    contextWindow,
    contextUtilization,
    durationMs,
  }: Props = $props();

  let gitBranch = $state("");
  let gitFiles = $state(0);
  let gitInsertions = $state(0);
  let gitDeletions = $state(0);
  let gitLoaded = $state(false);

  async function refreshGit() {
    if (!cwd) return;
    try {
      const summary: GitSummary = await getGitSummary(cwd);
      gitBranch = summary.branch || "";
      gitFiles = summary.total_files || 0;
      gitInsertions = summary.total_insertions || 0;
      gitDeletions = summary.total_deletions || 0;
      gitLoaded = true;
    } catch {
      gitBranch = "";
      gitFiles = 0;
      gitLoaded = true;
    }
  }

  onMount(() => {
    refreshGit();
    const interval = setInterval(refreshGit, 30_000);
    return () => clearInterval(interval);
  });

  // Refresh git when cwd changes
  $effect(() => {
    if (cwd) refreshGit();
  });

  // Derived values
  let projectName = $derived(cwdDisplayLabel(cwd));
  let sessionName = $derived(run?.name?.trim() || run?.cli_slug?.trim() || "");

  let effectiveCtxWindow = $derived(getContextWindowForModel(model, contextWindow));

  let usedPct = $derived.by(() => {
    if (effectiveCtxWindow <= 0) return 0;
    if (contextUtilization > 0) return Math.min(contextUtilization * 100, 100);
    // Fallback: compute from raw tokens when store contextUtilization is 0
    const used = inputTokens + cacheReadTokens + cacheWriteTokens;
    if (used <= 0) return 0;
    return Math.min((used / effectiveCtxWindow) * 100, 100);
  });

  let usedTokens = $derived(
    effectiveCtxWindow > 0 ? Math.round(usedPct * effectiveCtxWindow / 100) : 0,
  );

  // Duration formatting
  let durationDisplay = $derived.by(() => {
    const totalSecs = Math.floor(durationMs / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}m ${s}s`;
  });

  // Progress bar (20 chars)
  let barDisplay = $derived.by(() => {
    const len = 20;
    const filled = Math.min(Math.round(usedPct * len / 100), len);
    return "\u2588".repeat(filled) + "\u2591".repeat(len - filled);
  });

  // Context bar color
  let barColor = $derived.by(() => {
    if (usedPct >= 90) return "text-red-400";
    if (usedPct >= 70) return "text-amber-400";
    return "text-emerald-400";
  });
</script>

<div class="mx-3 mb-1 select-none rounded-lg border border-border/40 bg-surface-secondary/60 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/70">
  <!-- Line 1: model, project, branch, session, git changes -->
  <div class="flex flex-wrap items-center gap-x-2">
    <span class="font-semibold text-foreground">[{model || "—"}]</span>
    <span class="text-blue-400">{projectName}</span>
    {#if gitLoaded && gitBranch}
      <span class="text-foreground/40">|</span>
      <span class="text-purple-400">{gitBranch}</span>
    {/if}
    {#if sessionName}
      <span class="text-foreground/40">|</span>
      <span class="text-cyan-400">{sessionName}</span>
    {/if}
    {#if gitLoaded && (gitFiles > 0 || gitInsertions > 0 || gitDeletions > 0)}
      <span class="text-foreground/40">|</span>
      <span class="text-yellow-400">{gitFiles} files</span>
      <span class="text-green-400">+{gitInsertions}</span>
      <span class="text-red-400">-{gitDeletions}</span>
    {/if}
  </div>

  <!-- Line 2: context bar, tokens, cost, duration -->
  <div class="flex flex-wrap items-center gap-x-2">
    <span class={barColor}>{barDisplay}</span>
    <span>{usedPct.toFixed(0)}%</span>
    <span class="text-foreground/50">({formatTokenCount(usedTokens)}/{formatTokenCount(effectiveCtxWindow)})</span>
    <span class="text-foreground/40">|</span>
    <span>&uarr;{formatTokenCount(inputTokens + cacheReadTokens + cacheWriteTokens)}</span>
    <span>&darr;{formatTokenCount(outputTokens)}</span>
    <span class="text-foreground/40">|</span>
    <span class="text-amber-300">{formatCost(cost)}</span>
    <span class="text-foreground/40">|</span>
    <span>{durationDisplay}</span>
  </div>
</div>
