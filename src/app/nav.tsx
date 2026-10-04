import Link from "next/link";

/**
 * One line of navigation: the Start screen, then one link per section of SPEC.md §4. "The path",
 * "the news" and "next moves" arrive in weeks 8 and 9 (§8).
 */
export default function Nav() {
  return (
    <nav className="border-b border-hairline bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-2 sm:px-6 lg:px-8">
        <span className="mr-3 text-sm font-semibold tracking-tight text-ink">
          Pathfinder
        </span>
        <NavLink href="/">Start</NavLink>
        <NavLink href="/job">Job</NavLink>
        <NavLink href="/calculator">Calculator</NavLink>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1 text-sm text-ink-secondary hover:bg-plane hover:text-ink"
    >
      {children}
    </Link>
  );
}
