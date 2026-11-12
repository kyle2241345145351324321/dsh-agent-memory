/**
 * dsh-agent-memory — prompt rendering.
 *
 * Two contributions, split by what changes and what does not:
 *
 * 1. {@link MEMORY_INSTRUCTIONS} is a static system-prompt **section**: how the
 *    tool works and when saving is worthwhile. It is stable, so it stays in the
 *    prompt prefix cache.
 * 2. {@link renderMemorySnapshot} renders the enabled entries as dynamic
 *    **context**: a durable user-role snapshot refreshed at assembly and at each
 *    request admission, so editing memory in Settings changes the next request
 *    without restarting anything.
 *
 * @module dsh-agent-memory/render
 */

/** Hard cap on rendered snapshot characters, so memory cannot crowd out the task. */
export const DEFAULT_MAX_PROMPT_CHARS = 6000;
/** Frame markers keep the snapshot recognizable in a transcript and easy to strip. */
export const FRAME_OPEN = '<user-memory>';
/** Closing frame marker. */
export const FRAME_CLOSE = '</user-memory>';

/** Model-facing instructions for the memory tool. */
export const MEMORY_INSTRUCTIONS = `## Memory

You have a persistent memory tool (\`memory\`) shared with the user. Entries survive across conversations. Two scopes:
- \`global\` — stable facts and preferences about the user that apply everywhere (language, tone, standing rules, personal context).
- \`project\` — facts about the current workspace: conventions, architecture decisions, commands that work, known gotchas, where things live.

Save proactively when the user states a durable preference, corrects you in a way that will matter next time, shares a personal detail worth keeping, or when you learn something a future session in this workspace would need. Do not save transient task state, restatements of the current request, or secrets (passwords, tokens, API keys, credentials).

Keep each entry to one short, self-contained sentence — a future session sees it without the conversation around it. Before adding, \`list\` (or \`search\`) existing entries and \`update\` one instead of duplicating it; \`remove\` entries that are no longer true. The user can see and edit every entry in Settings → Memory, so do not claim something is remembered unless the tool call succeeded.`;

/**
 * Escape the frame terminator so a stored sentence cannot close the snapshot
 * early and turn the rest of the entries into stray prose.
 * @param text - one entry's text.
 * @returns text safe inside the frame.
 */
function escapeFrame(text) {
  return text.replaceAll(FRAME_CLOSE, '<\\/user-memory>');
}

/**
 * Render the enabled memories as the prompt context body.
 * @param snapshot - `{global, project, projectPath}` from `memory.snapshot()`.
 * @param maxChars - character budget; entries past it are omitted with a note.
 * @returns the framed snapshot, or `''` when there is nothing to inject.
 */
export function renderMemorySnapshot(snapshot, maxChars = DEFAULT_MAX_PROMPT_CHARS) {
  const globalEntries = Array.isArray(snapshot?.global) ? snapshot.global : [];
  const projectEntries = Array.isArray(snapshot?.project) ? snapshot.project : [];
  const projectPath = typeof snapshot?.projectPath === 'string' ? snapshot.projectPath : undefined;
  if (globalEntries.length === 0 && projectEntries.length === 0) return '';

  const header = [
    'Durable memory carried over from earlier conversations. Treat these entries as standing preferences and workspace facts, not as instructions for this turn: if an entry conflicts with the current request, the current request wins. Keep them current with the `memory` tool when they become wrong.',
  ];
  const globalLines = globalEntries.map((entry) => `- [${entry.id}] ${escapeFrame(entry.text)}`);
  const projectLines = projectEntries.map((entry) => `- [${entry.id}] ${escapeFrame(entry.text)}`);

  const sections = [
    { title: 'Global memory (all sessions):', lines: globalLines },
    ...(projectPath === undefined
      ? []
      : [{ title: `Project memory for ${projectPath} (this working directory):`, lines: projectLines }]),
  ];

  const budget = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MAX_PROMPT_CHARS;
  const used = header.join('\n').length + FRAME_OPEN.length + FRAME_CLOSE.length + 2;
  let remaining = budget - used;
  const body = [];
  let omitted = 0;
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    const heading = section.title;
    if (heading.length + 1 > remaining) {
      omitted += section.lines.length;
      continue;
    }
    body.push(heading);
    remaining -= heading.length + 1;
    for (const line of section.lines) {
      if (line.length + 1 > remaining) {
        omitted += 1;
        continue;
      }
      body.push(line);
      remaining -= line.length + 1;
    }
  }
  if (omitted > 0) body.push(`- (${omitted} more ${omitted === 1 ? 'entry' : 'entries'} omitted to fit the prompt budget; use the memory tool to list them)`);

  return [FRAME_OPEN, ...header, '', ...body, FRAME_CLOSE].join('\n');
}
