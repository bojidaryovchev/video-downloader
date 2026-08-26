import type { JSX, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M6 4.5v15l13-7.5z" />
  </Icon>
)

export const StopIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
)

export const TrashIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
  </Icon>
)

export const FolderIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
)

export const GearIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5 13.3 5a7.5 7.5 0 0 1 2 .8l2.5-.9 1.8 1.8-.9 2.5c.35.62.62 1.29.8 2l2.5 1.3-.5 2.5-2.6.6a7.5 7.5 0 0 1-1.2 1.7l.4 2.6-2.3 1.2-1.9-1.8a7.5 7.5 0 0 1-2.1 0l-1.9 1.8-2.3-1.2.4-2.6a7.5 7.5 0 0 1-1.2-1.7l-2.6-.6-.5-2.5 2.5-1.3c.18-.71.45-1.38.8-2l-.9-2.5L6.2 4.9l2.5.9a7.5 7.5 0 0 1 2-.8z" />
  </Icon>
)

export const ClipboardIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
  </Icon>
)

export const PlusIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const RefreshIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </Icon>
)

export const ExternalIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
)

export const CheckIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const AlertIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.3" />
  </Icon>
)

export const DownloadIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </Icon>
)

export const FilmIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 12h18M3 8.5h4M3 15.5h4M17 8.5h4M17 15.5h4" />
  </Icon>
)
