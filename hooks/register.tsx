import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const isShowingDiffs = atom({ plugin: 'quiet-diffs', key: 'isShowingDiffs' } as const, false)

const FILE_TOOLS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const HINT = ' · diff hidden (ctrl+o to view, /diffs to show)'

// One run of the summary line: green for what was added, red for what was
// removed, dim for everything else.
type Tone = 'add' | 'del' | 'dim'
type Part = { text: string; tone: Tone }

type Hunk = { lines: readonly string[] }
type FileOutput = {
  type?: 'create' | 'update'
  structuredPatch?: readonly Hunk[]
  content?: string
  edit_mode?: string
}
// What a shell command's result carries about the files it changed.
type ChangedFile = { filePath: string; hunks: readonly Hunk[]; created?: true; deleted?: true }
type BashEditDiff = { files: readonly ChangedFile[]; moreFiles: number }

// A final newline ends the last line; it does not start another one.
function countLines(text: string): number {
  if (text === '') return 0
  const lines = text.split('\n').length
  return text.endsWith('\n') ? lines - 1 : lines
}

function countChanges(hunks: readonly Hunk[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function fileName(path: string): string {
  return path.split('/').pop() || path
}

// "+3 −2", leaving out a side that is zero; "no changes" when both are.
function counts(added: number, removed: number): Part[] {
  const parts: Part[] = []
  if (added > 0) parts.push({ text: `+${added}`, tone: 'add' })
  if (added > 0 && removed > 0) parts.push({ text: ' ', tone: 'dim' })
  if (removed > 0) parts.push({ text: `−${removed}`, tone: 'del' })
  return parts.length > 0 ? parts : [{ text: 'no changes', tone: 'dim' }]
}

function summarizeFileTool(tool: string, output: unknown): Part[] {
  const out = (output ?? {}) as FileOutput
  if (tool === 'NotebookEdit') {
    const mode = out.edit_mode ?? 'edited'
    const tone: Tone = mode === 'insert' ? 'add' : mode === 'delete' ? 'del' : 'dim'
    return [{ text: `notebook cell ${mode}`, tone }]
  }
  if (tool === 'Write' && out.type === 'create') {
    return [{ text: `created, ${plural(countLines(out.content ?? ''), 'line')}`, tone: 'add' }]
  }
  const { added, removed } = countChanges(out.structuredPatch ?? [])
  return counts(added, removed)
}

function bashEditDiffOf(output: unknown): BashEditDiff | undefined {
  if (typeof output !== 'object' || output === null) return undefined
  const diff = (output as { bashEditDiff?: BashEditDiff }).bashEditDiff
  return diff !== undefined && diff.files.length > 0 ? diff : undefined
}

function summarizeBash(diff: BashEditDiff): Part[] {
  const total = diff.files.length + diff.moreFiles
  let added = 0
  let removed = 0
  for (const file of diff.files) {
    const change = countChanges(file.hunks)
    added += change.added
    removed += change.removed
  }
  const only = diff.files[0]
  if (total === 1 && only !== undefined) {
    const name = fileName(only.filePath)
    if (only.deleted) return [{ text: `deleted ${name}${removed > 0 ? ` −${removed}` : ''}`, tone: 'del' }]
    if (only.created) return [{ text: `created ${name}${added > 0 ? ` +${added}` : ''}`, tone: 'add' }]
    return [{ text: `changed ${name} `, tone: 'dim' }, ...counts(added, removed)]
  }
  return [{ text: `changed ${plural(total, 'file')} `, tone: 'dim' }, ...counts(added, removed)]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diffs',
      description: 'Toggle showing file diffs (edits and shell commands) in the transcript',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'diffs' }, async $ => {
    let nowShowing = false
    await update($, isShowingDiffs, v => (nowShowing = !v))
    return { text: nowShowing ? 'File diffs: shown' : 'File diffs: hidden (ctrl+o still shows them)' }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, isExpanded, isErrored, output } = e.props
    const bashDiff = tool === 'Bash' ? bashEditDiffOf(output) : undefined
    if (!FILE_TOOLS.includes(tool) && bashDiff === undefined) return next(e)
    // Full diff in the ctrl+o view, on errors, or when toggled on.
    if (isExpanded || isErrored || (await read($, isShowingDiffs))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts = bashDiff !== undefined ? summarizeBash(bashDiff) : summarizeFileTool(tool, output)
    const summary = (
      <Box key="summary">
        <Text>
          {e.surface === 'terminal' && <Text dimColor>{'  ⎿  '}</Text>}
          <Text dimColor>✓ </Text>
          {parts.map(part =>
            part.tone === 'dim' ? (
              <Text dimColor>{part.text}</Text>
            ) : (
              <Text color={part.tone === 'add' ? 'success' : 'error'}>{part.text}</Text>
            ),
          )}
          <Text dimColor>{HINT}</Text>
        </Text>
      </Box>
    )
    if (bashDiff === undefined) return summary

    // A shell command keeps its own output; only its list of changed files goes.
    const { bashEditDiff: _hidden, ...rest } = output as Record<string, unknown>
    const drawn = await next({ ...e, props: { ...e.props, output: rest } })
    return (
      <Box flexDirection="column">
        {drawn}
        {summary}
      </Box>
    )
  })
}
