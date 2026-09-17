import type { Device } from '../tts/messages'
import type { TtsStatus } from '../tts/useTts'

type Props = { status: TtsStatus; loadPct: number; device?: Device }

export function ModelStatus({ status, loadPct, device }: Props) {
  if (status === 'loading') {
    const preparing = loadPct >= 100
    return (
      <p role="status" className="flex items-center gap-2.5 text-[13px] text-pencil">
        <span className="h-1 w-14 overflow-hidden rounded-full bg-rule">
          <span
            className={`block h-full rounded-full bg-ink transition-[width] duration-300 ${preparing ? 'animate-pulse' : ''}`}
            style={{ width: `${loadPct}%` }}
          />
        </span>
        <span className="tabular-nums">
          {preparing ? 'Preparing voice model' : `Loading voice model ${loadPct}%`}
        </span>
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p role="status" className="flex items-center gap-2 text-[13px] font-medium text-danger">
        <span className="size-2 rounded-full bg-danger" />
        Voice model unavailable
      </p>
    )
  }

  const gpu = device === 'webgpu'
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-[13px] text-pencil"
      title={gpu ? 'Using WebGPU' : 'Using WebAssembly. Chrome, Edge or Safari with WebGPU is about 7× faster.'}
    >
      <span className="size-2 rounded-full bg-ok" />
      <span>
        <span className="font-medium text-ink">Ready</span>
        {gpu ? ', running on GPU' : ', running on CPU (slower)'}
      </span>
    </p>
  )
}
