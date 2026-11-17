import type { StepInput } from './steps'

/**
 * Step clicks from the presenter window, played in the audience window.
 * Only the audience window runs Linux; both windows are tabs of the same browser.
 */
export interface RelayedStep {
  page: number
  to: string
  step: StepInput
}

const CHANNEL_NAME = 'terminal-glance:shell-steps'

let channel: BroadcastChannel | undefined
let serving = false

function openChannel(): BroadcastChannel {
  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function relayStep(message: RelayedStep): void {
  openChannel().postMessage(message)
}

export function serveRelayedSteps(play: (message: RelayedStep) => void): void {
  if (serving)
    return
  serving = true
  openChannel().addEventListener('message', (event: MessageEvent<RelayedStep>) => play(event.data))
}

import.meta.hot?.dispose(() => channel?.close())
