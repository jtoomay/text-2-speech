import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon(props: IconProps) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" {...props} />
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.6v12.8a1.1 1.1 0 0 0 1.67.94l10.3-6.4a1.1 1.1 0 0 0 0-1.88L9.67 4.66A1.1 1.1 0 0 0 8 5.6Z" />
    </Icon>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
    </Icon>
  )
}

export function PreviousIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="5.5" width="2.6" height="13" rx="1.1" />
      <path d="M19 6.7v10.6a1 1 0 0 1-1.54.84L9.9 13.26a1.5 1.5 0 0 1 0-2.52l7.56-4.88A1 1 0 0 1 19 6.7Z" />
    </Icon>
  )
}

export function NextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="16.4" y="5.5" width="2.6" height="13" rx="1.1" />
      <path d="M5 6.7v10.6a1 1 0 0 0 1.54.84l7.56-4.88a1.5 1.5 0 0 0 0-2.52L6.54 5.86A1 1 0 0 0 5 6.7Z" />
    </Icon>
  )
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4.5v10m0 0-4-4m4 4 4-4M5.5 19.5h13" />
    </Icon>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m7 10 5 5 5-5" />
    </Icon>
  )
}

/** Three lines of text with the middle one highlighted. Matches public/favicon.svg. */
export function Mark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <rect x="8" y="8.5" width="16" height="2.6" rx="1.3" fill="var(--paper)" opacity="0.55" />
      <rect x="6.5" y="13.4" width="19" height="5.2" rx="1.2" fill="var(--highlight)" />
      <rect x="8" y="14.7" width="12.5" height="2.6" rx="1.3" fill="var(--on-highlight)" />
      <rect x="8" y="20.9" width="10" height="2.6" rx="1.3" fill="var(--paper)" opacity="0.55" />
    </svg>
  )
}
