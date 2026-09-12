import Link from "next/link";

// A small house-icon link back to the home route. Used in page headers so the
// user always has an obvious way back to the builder + their saved kits.
export default function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Home"
      title="Home"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-ink-2 transition hover:border-border-strong hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
      </svg>
    </Link>
  );
}
