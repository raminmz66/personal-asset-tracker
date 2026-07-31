import { useNavigate } from 'react-router'

export type BackButtonProps = {
  fallbackTo: string
}

/**
 * Back control that performs the same action as the phone's back button.
 *
 * The chevron is an SVG on purpose: `›` (U+203A) is bidi-mirrored and renders
 * as `‹` inside this RTL document, which is what made the old character-based
 * chevron point the wrong way.
 */
export function BackButton({ fallbackTo }: BackButtonProps) {
  const navigate = useNavigate()

  function handleClick() {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate(fallbackTo, { replace: true })
    }
  }

  return (
    <button
      type="button"
      className="nav-back"
      onClick={handleClick}
      aria-label="بازگشت"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
