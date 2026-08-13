export function Rules({ defaultOpen = false, title = 'Full rules' }: { defaultOpen?: boolean; title?: string }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <summary className="cursor-pointer select-none font-semibold text-slate-100">{title}</summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
        <p>
          <strong className="text-slate-100">Objective:</strong> Villagers (every non-Mafia role) win by voting out
          every Mafia member before they're outnumbered. Mafia win the moment they equal or outnumber everyone left
          alive.
        </p>

        <div>
          <p className="font-semibold text-slate-100">How a round works:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-slate-100">Night</strong> — Mafia secretly agree on someone to eliminate, the
              Doctor secretly protects someone, and the Detective secretly investigates someone. Villagers have no
              action and simply wait.
            </li>
            <li>
              <strong className="text-slate-100">Night Results</strong> — a short pause where everyone learns what
              happened (a death, or that no one died).
            </li>
            <li>
              <strong className="text-slate-100">Day — Discussion</strong> — everyone talks openly about who they
              suspect.
            </li>
            <li>
              <strong className="text-slate-100">Day — Voting</strong> — everyone votes for who to eliminate.
              Whoever gets the most votes is eliminated; a tie eliminates no one.
            </li>
            <li>
              <strong className="text-slate-100">Elimination</strong> — whoever was voted out gets a short window
              for last words before the next night begins.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-slate-100">Roles:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-rose-400">Mafia</strong> — Each night, agree on a player to eliminate. You
              know who your fellow Mafia are and have a private Mafia Chat to coordinate.
            </li>
            <li>
              <strong className="text-emerald-400">Doctor</strong> — Each night, choose a player to protect from the
              Mafia's kill. You may protect yourself.
            </li>
            <li>
              <strong className="text-sky-400">Detective</strong> — Each night, investigate a player to privately
              learn whether they're Mafia.
            </li>
            <li>
              <strong className="text-slate-300">Villager</strong> — No special ability. Discussion and voting are
              your only tools.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-slate-100">Ground rules:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Never state your role out loud in Public Chat — announcing it removes the deduction from the game.
            </li>
            <li>Mafia Chat is private for a reason. Nothing discussed there should ever be repeated in Public Chat.</li>
            <li>
              The Detective's results are only ever shown to the Detective — sharing them (truthfully, or as a
              bluff) is a real strategic choice, since no one else can verify it.
            </li>
            <li>
              Once you're eliminated, you can keep watching, but let the living players run the discussion — don't
              give away what you saw or suspected.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
