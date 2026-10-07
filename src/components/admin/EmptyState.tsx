/** What an admin panel, chart or table shows in place of content when there is
 * nothing to show — so "nothing here" never looks like "something broke". */
export function EmptyState({
  message,
  hint,
}: {
  message: string;
  /** A second line explaining what to do about it, where there is something to do. */
  hint?: string;
}) {
  return (
    <div className="border-line text-brown/70 rounded-lg border border-dashed px-4 py-6 text-center">
      <p className="text-xs">{message}</p>
      {hint && <p className="text-brown/60 mx-auto mt-1.5 max-w-md text-[11px]">{hint}</p>}
    </div>
  );
}
