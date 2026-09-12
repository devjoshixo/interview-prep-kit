// Shown instantly by Next.js while the home route server-renders (it queries the
// user's saved kits), so navigating home never looks stuck.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[760px] items-center justify-center px-5 py-32">
      <div className="flex items-center gap-3 text-ink-2">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
