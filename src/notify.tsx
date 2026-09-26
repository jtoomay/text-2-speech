import toast from 'react-hot-toast'
import { AppToast } from './components/AppToast'

type Action = { label: string; onClick: () => void }
type Options = { tone?: 'ok' | 'error'; description?: string; action?: Action; duration?: number }

export function notify(title: string, options: Options = {}) {
  const { tone = 'ok', description, action, duration = tone === 'error' ? 7000 : 5000 } = options
  toast.custom(
    (t) => (
      <AppToast
        tone={tone}
        title={title}
        description={description}
        action={action}
        onDismiss={() => toast.dismiss(t.id)}
      />
    ),
    { duration },
  )
}
