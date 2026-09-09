export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Interview Prep Kit</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Skeleton is up and running. The pipeline, pages, and models are stubs
        waiting for real code.
      </p>
      {/* TODO(owner): build the real UI — JD input, kit view, edit/pin state. */}
    </main>
  );
}
