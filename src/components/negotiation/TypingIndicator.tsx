/**
 * 3-dot typing indicator. Rendered when status='negotiating' and there is no
 * streaming agent message yet (D-05 phase a).
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-t-lg rounded-br-lg rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-600">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  );
}
