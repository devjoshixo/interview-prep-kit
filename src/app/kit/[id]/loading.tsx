// Shown instantly by Next.js while the kit page server-renders, so opening a kit
// never looks stuck between the click and the content appearing.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[760px] items-center justify-center px-5 py-32">
      <div className="flex items-center gap-3 text-ink-2">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-sm font-medium">Loading your kit…</span>
      </div>
    </div>
  );
}
