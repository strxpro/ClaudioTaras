/** Instant feedback while an admin page loads. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true" aria-label="Ładowanie">
      <div className="mb-8 h-14 w-64 rounded-xl bg-ink/10" />
      <div className="mb-6 h-44 rounded-2xl bg-ink/[0.08]" />
      <div className="grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white" />
        ))}
      </div>
    </div>
  );
}
