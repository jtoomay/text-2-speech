type Action = { label: string; onClick: () => void }

type Props = {
  tone: 'ok' | 'error'
  title: string
  description?: string
  action?: Action
  onDismiss: () => void
}

export function AppToast({ tone, title, description, action, onDismiss }: Props) {
  return (
    <div role="status" className="sheet flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 px-4 py-3">
      <span className={`mt-1.5 size-2 flex-none rounded-full ${tone === 'error' ? 'bg-danger' : 'bg-ok'}`} />
      <div className="flex-1 text-[13px]">
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="text-pencil">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          className="link-button text-[13px]"
          onClick={() => {
            action.onClick()
            onDismiss()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
