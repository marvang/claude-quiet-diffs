import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const HINT = ' · diff hidden (ctrl+o to view, /diffs to show)'
const LEAD = '  ⎿  ✓ '

// The diff-summary tests run with focus mode off, as /quiet leaves it.
async function focusOff($: Engine) {
  await $.command.run({
    command: 'quiet',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
}

function call(tool: string, input: unknown, output?: unknown, extra: Record<string, unknown> = {}) {
  return {
    plugin: 'quiet-diffs',
    component: 'ToolUse',
    requestId: 'toolu_1',
    surface: 'terminal',
    props: { tool_use_id: 'toolu_1', tool, input, output, isRunning: false, isErrored: false, isInterrupted: false, ...extra },
  } as const
}

function result(tool: string, output: unknown) {
  return {
    plugin: 'quiet-diffs',
    component: 'ToolResult',
    requestId: 'toolu_1',
    surface: 'terminal',
    props: { tool_use_id: 'toolu_1', tool, output, isErrored: false },
  } as const
}

test('a created 4-line file reads 4 lines, in green', async $ => {
  await focusOff($)
  const output = { type: 'create', filePath: '/x/a.txt', content: 'one\ntwo\nthree\nfour\n', structuredPatch: [], originalFile: null }
  const ui = await $.ui.mount(result('Write', output))
  expect((await ui.find({ key: 'summary' }))?.text).toBe(`${LEAD}created, 4 lines${HINT}`)
  expect((await ui.find({ type: 'Text', text: /^created, 4 lines$/ }))?.props.color).toBe('success')
  await ui.unmount()
})

test('a file with no final newline counts its last line', async $ => {
  await focusOff($)
  const output = { type: 'create', filePath: '/x/b.txt', content: 'one\ntwo', structuredPatch: [], originalFile: null }
  const ui = await $.ui.mount(result('Write', output))
  expect((await ui.find({ key: 'summary' }))?.text).toBe(`${LEAD}created, 2 lines${HINT}`)
  await ui.unmount()
})

test('an edit shows +added in green and −removed in red', async $ => {
  await focusOff($)
  const output = {
    filePath: '/x/a.txt',
    oldString: 'two\nthree',
    newString: 'two!\nthree!\nnew',
    originalFile: 'one\ntwo\nthree\nfour\n',
    structuredPatch: [
      { oldStart: 1, oldLines: 4, newStart: 1, newLines: 5, lines: [' one', '-two', '-three', '+two!', '+three!', '+new', ' four'] },
    ],
    userModified: false,
    replaceAll: false,
  }
  const ui = await $.ui.mount(result('Edit', output))
  expect((await ui.find({ key: 'summary' }))?.text).toBe(`${LEAD}+3 −2${HINT}`)
  expect((await ui.find({ type: 'Text', text: /^\+3$/ }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: /^−2$/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test('a shell command keeps its output, drops its diff, adds a red summary', async ($, on) => {
  // Stands for the engine's own drawing of the result.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const output = e.component === 'ToolResult' ? (e.props.output as Record<string, unknown>) : {}
    return <Text>engine {'bashEditDiff' in output ? 'with diff' : 'without diff'}</Text>
  })
  await focusOff($)
  const output = {
    stdout: 'deleted',
    stderr: '',
    interrupted: false,
    bashEditDiff: {
      files: [
        { filePath: '/x/quiet-diffs-test.txt', deleted: true, hunks: [{ oldStart: 1, oldLines: 5, newStart: 0, newLines: 0, lines: ['-a', '-b', '-c', '-d', '-e'] }] },
      ],
      moreFiles: 0,
    },
  }
  const ui = await $.ui.mount(result('Bash', output))
  expect((await ui.find({ type: 'Text', text: /^engine/ }))?.text).toBe('engine without diff')
  expect((await ui.find({ key: 'summary' }))?.text).toBe(`${LEAD}deleted quiet-diffs-test.txt −5${HINT}`)
  expect((await ui.find({ type: 'Text', text: /^deleted/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test('a shell command that changed no files is left alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await focusOff($)
  const ui = await $.ui.mount(result('Bash', { stdout: 'hi', stderr: '', interrupted: false }))
  expect((await ui.find({ type: 'Text', text: /^engine/ }))?.text).toBe('engine')
  expect(await ui.find({ key: 'summary' })).toBeUndefined()
  await ui.unmount()
})

test('focus mode: a shell call is one dim line with its command', async $ => {
  const command = "cd /home/x/work && python3 -I - STATE.md <<'PY'\nimport sys\nPY"
  const ui = await $.ui.mount(call('Bash', { command }, { stdout: 'ok', stderr: '', interrupted: false }))
  expect((await ui.find({ key: 'focus-line' }))?.text).toBe("  · Bash  cd /home/x/work && python3 -I - STATE.md <<'PY'…")
  await ui.unmount()
})

test('focus mode: an edit line ends with colored counts', async $ => {
  const output = { filePath: '/x/STATE.md', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }
  const ui = await $.ui.mount(call('Edit', { file_path: '/x/STATE.md' }, output))
  expect((await ui.find({ key: 'focus-line' }))?.text).toBe('  · Edit  STATE.md  +1 −1')
  expect((await ui.find({ type: 'Text', text: /^\+1$/ }))?.props.color).toBe('success')
  await ui.unmount()
})

test('focus mode: a result draws nothing', async $ => {
  const ui = await $.ui.mount(result('Bash', { stdout: 'b17cb65 chap-ablation', stderr: '', interrupted: false }))
  expect(await ui.find({ type: 'Text', text: /b17cb65/ })).toBeUndefined()
  await ui.unmount()
})

test('focus mode: a failed call is drawn in full', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(call('Bash', { command: 'false' }, 'Exit code 1', { isErrored: true }))
  expect((await ui.find({ type: 'Text', text: /^engine/ }))?.text).toBe('engine')
  expect(await ui.find({ key: 'focus-line' })).toBeUndefined()
  await ui.unmount()
})
