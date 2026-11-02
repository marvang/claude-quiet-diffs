export type DiffVisibility = boolean

declare module 'claude-code' {
  interface PluginState {
    'quiet-diffs': { isShowingDiffs: DiffVisibility; isFocusMode: boolean }
  }
}
