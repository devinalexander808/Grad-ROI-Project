import Link from "next/link";
import { formatDollars } from "@/lib/format";
import { selectedWage, type Selection } from "@/lib/selection";

/** Within this many dollars, the median counts as sitting on the breakeven line. */
const RIGHT_AT_TOLERANCE = 500;

/**
 * SPEC.md §4.4, "Next moves" — the first slice of it: where the BLS median for
 * the chosen job sits against this program's breakeven salary, and one step to
 * take next. Every number is either the user's model output or the BLS figure
 * carried over from the Job page; nothing is estimated here (§5).
 */
export default function NextMoves({
  breakevenS1,
  selection,
}: {
  breakevenS1: number;
  selection: Selection;
}) {
  // Metro median when the user picked a metro, else the state median.
  const { median, place: area, level } = selectedWage(selection);
  const gap = median - breakevenS1;
  const place = `${midSentence(selection.title)} in ${area}`;

  const comparison =
    Math.abs(gap) <= RIGHT_AT_TOLERANCE
      ? "right at the breakeven line"
      : `${formatDollars(Math.abs(gap))} ${gap > 0 ? "above" : "below"} the breakeven line`;

  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Next moves</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-secondary">
        <p>
          This program breaks even if you start at{" "}
          <strong className="font-semibold text-ink">
            {formatDollars(breakevenS1)}
          </strong>
          .
        </p>
        <p>
          The BLS median for {place} is{" "}
          <strong className="font-semibold text-ink">
            {formatDollars(median)}
          </strong>{" "}
          — that is {comparison}.
        </p>
        <p>
          {gap >= 0 ? (
            <>
              Next: check what employers are asking for in {area}{" "}
              postings.{" "}
              <Link href="/job" className="text-accent hover:underline">
                Go to the Job page
              </Link>
            </>
          ) : (
            <>
              Next: look for a cheaper program or a higher-paying state — try
              changing the {level === "metro area" ? "state or metro area" : "state"}{" "}
              on the{" "}
              <Link href="/job" className="text-accent hover:underline">
                Job page
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <p className="mt-3 text-xs text-muted">
        Wage: BLS OEWS{selection.year === null ? "" : ` ${selection.year}`},{" "}
        {level === "metro area" ? `metro area median (${area})` : "state median"}.
        Breakeven: your inputs above.
      </p>
    </section>
  );
}

/** "Financial analyst" → "financial analyst"; leaves "SOC 13-2051" alone. */
export function midSentence(title: string): string {
  if (/^[A-Z][a-z]/.test(title)) return title[0].toLowerCase() + title.slice(1);
  return title;
}
