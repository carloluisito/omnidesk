import { Rocket, ChevronRight, CheckCircle2, CheckCheck } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ReviewSummaryPanelProps {
  total: number;
  approved: number;
  onProceedToShip: () => void;
  onApproveAll?: () => void;
}

export function ReviewSummaryPanel({
  total,
  approved,
  onProceedToShip,
  onApproveAll,
}: ReviewSummaryPanelProps) {
  const pending = total - approved;
  const ready = approved === total && total > 0;
  const progressPercent = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="text-sm font-semibold text-white">Summary</div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                ready ? 'bg-green-500' : 'bg-blue-500'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-white/50 text-right">
            {progressPercent}% complete
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm text-white/70">
          <div className="flex justify-between">
            <span>Total files</span>
            <span className="font-semibold text-white">{total}</span>
          </div>
          <div className="flex justify-between">
            <span>Approved</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              {approved > 0 && <CheckCircle2 className="h-3 w-3" />}
              {approved}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Pending</span>
            <span className={cn('font-semibold', pending > 0 ? 'text-yellow-400' : 'text-white')}>
              {pending}
            </span>
          </div>
        </div>

        {/* Approve All button */}
        {onApproveAll && pending > 0 && (
          <button
            onClick={onApproveAll}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <CheckCheck className="h-4 w-4" />
            Approve All Files
          </button>
        )}

        {/* All approved message */}
        {ready && (
          <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            All files approved!
          </div>
        )}
      </div>

      <button
        onClick={onProceedToShip}
        disabled={!ready}
        className={cn(
          'inline-flex w-full items-center justify-between rounded-3xl px-4 py-3 text-left ring-1 transition',
          ready
            ? 'bg-white text-black ring-white hover:opacity-90'
            : 'bg-white/10 text-white/40 ring-white/10 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          <div>
            <div className="text-sm font-semibold">Proceed to Ship</div>
            <div className="text-xs opacity-70">
              {ready ? 'Ready to commit' : 'All files must be approved'}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 opacity-60" />
      </button>

      {!ready && (
        <div className="rounded-2xl bg-white/5 p-3 text-xs text-white/60 ring-1 ring-white/10">
          Click on each file and approve it, or use "Approve All" to approve everything at once.
        </div>
      )}
    </div>
  );
}
