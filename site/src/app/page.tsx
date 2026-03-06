export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      {/* Hero */}
      <section className="w-full max-w-3xl mx-auto px-6 pt-20 pb-16 md:pt-32 md:pb-24">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 font-[family-name:var(--font-mono)]">
          whizmob
        </h1>
        <p className="text-lg md:text-xl text-[var(--color-muted)] mb-10 max-w-2xl leading-relaxed">
          See what AI agent systems you&apos;ve actually built. Scans your
          machine for agents, skills, MCP servers, and configs &mdash; then
          shows you how they connect.
        </p>

        <div className="terminal mb-4">
          <div>
            <span className="prompt">$ </span>npx whizmob scan
          </div>
          <div className="output mt-1">
            [whizmob] DB updated: 42 total, +42 added, -0 removed
          </div>
          <div className="output">
            [whizmob] New: code-reviewer, test-runner, deploy-agent, standup,
            roadmap, ...
          </div>
          <div className="output">[whizmob] Edges: 67 inferred</div>
        </div>
        <div className="terminal">
          <div>
            <span className="prompt">$ </span>npx whizmob demo --open
          </div>
          <div className="output mt-1">
            Opens an interactive graph of your agents in the browser.
          </div>
        </div>

        <p className="text-sm text-[var(--color-muted)] mt-6">
          No accounts. No API keys. No config. Everything stays on your machine.
        </p>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Command Reference */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-2">Commands</h2>
        <p className="text-sm text-[var(--color-muted)] mb-8">
          Click any command to see details and examples.
        </p>

        <div className="command-list">
          {/* scan */}
          <details className="command-item">
            <summary>
              <code className="command-name">scan</code>
              <span className="command-desc">
                Discover agents, skills, and MCP servers across all platforms
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob scan
                </div>
                <div className="output mt-1">
                  [whizmob] DB updated: 42 total, +42 added, -0 removed
                </div>
                <div className="output">
                  [whizmob] Edges: 67 inferred
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)] mb-3">
                Reads config files, then infers connections between components
                &mdash; agents referencing configs, skills invoking other skills,
                shared state. Connected components get grouped into{" "}
                <strong className="text-[var(--color-fg)]">mobs</strong>.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                      <th className="py-2 pr-8 font-medium">Location</th>
                      <th className="py-2 font-medium">What it finds</th>
                    </tr>
                  </thead>
                  <tbody className="font-[family-name:var(--font-mono)] text-sm">
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-2 pr-8 text-[var(--color-accent)]">
                        ~/.claude/
                      </td>
                      <td className="py-2 text-[var(--color-muted)]">
                        Agents, skills, MCP servers, settings
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-2 pr-8 text-[var(--color-accent)]">
                        ~/.cursor/
                      </td>
                      <td className="py-2 text-[var(--color-muted)]">
                        Agents, MCP servers, settings
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-2 pr-8 text-[var(--color-accent)]">
                        ~/.codex/
                      </td>
                      <td className="py-2 text-[var(--color-muted)]">
                        Skills
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-3">
                Also scans project directories for per-project{" "}
                <code className="text-[var(--color-accent)]">.claude/</code>{" "}
                configs.
              </p>
            </div>
          </details>

          {/* demo */}
          <details className="command-item">
            <summary>
              <code className="command-name">demo --open</code>
              <span className="command-desc">
                Interactive agent graph in your browser
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob demo --open
                </div>
                <div className="output mt-1">
                  Generated ~/.whizmob/demo.html (36KB, 3 mobs, 42 components)
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Generates a self-contained HTML file with an interactive
                force-directed graph of your agents. Zero dependencies &mdash;
                opens in any browser. Use{" "}
                <code className="text-[var(--color-accent)]">--output path</code>{" "}
                for a custom location.
              </p>
            </div>
          </details>

          {/* dashboard */}
          <details className="command-item">
            <summary>
              <code className="command-name">dashboard</code>
              <span className="command-desc">
                Full inspector at localhost:3333
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob dashboard
                </div>
                <div className="output mt-1">
                  Dashboard running at http://localhost:3333
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)] mb-4">
                Three-panel inspector: mob list, force-directed graph, and
                component detail cards. Plus searchable inventory, import tools,
                and mob management.
              </p>
              <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/inspector-preview.svg"
                  alt="Whizmob Mob Inspector — three-panel layout showing discovered mobs, force-directed graph, and component detail cards"
                  className="w-full"
                />
              </div>
            </div>
          </details>

          {/* stats */}
          <details className="command-item">
            <summary>
              <code className="command-name">stats</code>
              <span className="command-desc">
                Summary counts of everything found
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal">
                <div>
                  <span className="prompt">$ </span>npx whizmob stats
                </div>
                <div className="output mt-1">
                  42 passports, 3 platforms, 5 mobs, 67 edges
                </div>
              </div>
            </div>
          </details>

          {/* roster */}
          <details className="command-item">
            <summary>
              <code className="command-name">roster -s &quot;query&quot;</code>
              <span className="command-desc">
                Search agents by name or purpose
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob roster -s
                  &quot;deploy&quot;
                </div>
                <div className="output mt-1">
                  deploy-agent (subagent, claude) — Handles deployment to Vercel
                </div>
                <div className="output">
                  devops-engineer (subagent, claude) — CI/CD pipeline config
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Filter by type with{" "}
                <code className="text-[var(--color-accent)]">--type</code>,
                platform with{" "}
                <code className="text-[var(--color-accent)]">--platform</code>,
                or see mob memberships with{" "}
                <code className="text-[var(--color-accent)]">--hook</code>.
              </p>
            </div>
          </details>

          {/* mob define */}
          <details className="command-item">
            <summary>
              <code className="command-name">mob define</code>
              <span className="command-desc">
                Group agents into a named, portable mob
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob mob define
                  &quot;my-setup&quot; --add code-reviewer test-runner linter
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Mobs are named groups of agents, skills, hooks, and configs that
                work together. Use{" "}
                <code className="text-[var(--color-accent)]">mob list</code> and{" "}
                <code className="text-[var(--color-accent)]">mob show &lt;name&gt;</code>{" "}
                to view them.
              </p>
            </div>
          </details>

          {/* export */}
          <details className="command-item">
            <summary>
              <code className="command-name">export &lt;mob&gt;</code>
              <span className="command-desc">
                Bundle a mob for transfer to another machine
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob export my-setup
                </div>
                <div className="output mt-1">
                  Exported 12 files to ~/.whizmob/exports/my-setup/
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Rewrites absolute paths to placeholders, strips secrets and API
                keys, bootstraps memory files as empty structures. The output is
                a plain folder with a{" "}
                <code className="text-[var(--color-accent)]">manifest.json</code>{" "}
                &mdash; no binaries, git-friendly. Copy it however you like.
              </p>
            </div>
          </details>

          {/* import */}
          <details className="command-item">
            <summary>
              <code className="command-name">import &lt;bundle&gt;</code>
              <span className="command-desc">
                Install agents from a bundle or built-in mob
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob import
                  ./my-setup --dry-run
                </div>
                <div className="output mt-1">
                  Preview: 12 files, 2 conflicts, 1 MCP dependency
                </div>
              </div>
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob import
                  ./my-setup
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Use{" "}
                <code className="text-[var(--color-accent)]">--dry-run</code> to
                preview before installing.{" "}
                <code className="text-[var(--color-accent)]">--param</code>{" "}
                passes content parameters (names, paths) for the new
                environment.{" "}
                <code className="text-[var(--color-accent)]">--list</code> shows
                available pre-built mobs.
              </p>
            </div>
          </details>

          {/* update */}
          <details className="command-item">
            <summary>
              <code className="command-name">update &lt;bundle&gt;</code>
              <span className="command-desc">
                Sync upstream changes without losing local edits
              </span>
            </summary>
            <div className="command-detail">
              <div className="terminal mb-4">
                <div>
                  <span className="prompt">$ </span>npx whizmob update
                  ./my-setup
                </div>
                <div className="output mt-1">
                  3 upstream-only (auto-applied), 2 local-only (preserved), 1
                  both-changed (diff shown)
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Three-way comparison using content hashes: upstream-only changes
                auto-apply, local-only changes are preserved, both-changed files
                show you the diff. Use{" "}
                <code className="text-[var(--color-accent)]">--dry-run</code> to
                preview or{" "}
                <code className="text-[var(--color-accent)]">--force</code> to
                overwrite.
              </p>
            </div>
          </details>
        </div>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Prerequisites */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">Getting started</h2>
        <ul className="space-y-3 text-[var(--color-muted)] text-sm mb-8">
          <li>
            <strong className="text-[var(--color-fg)]">Node.js 20+</strong>
            {" "}&mdash; check with{" "}
            <code className="text-[var(--color-accent)]">node --version</code>
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">macOS:</strong>{" "}
            <code className="text-[var(--color-accent)]">
              xcode-select --install
            </code>{" "}
            for native build tools
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">Linux:</strong>{" "}
            <code className="text-[var(--color-accent)]">
              build-essential
            </code>{" "}
            and{" "}
            <code className="text-[var(--color-accent)]">python3</code>
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">
              At least one AI tool:
            </strong>{" "}
            Claude Code, Cursor, or Codex
          </li>
        </ul>

        <details className="command-item">
          <summary>
            <span className="text-[var(--color-fg)] font-medium">Troubleshooting</span>
          </summary>
          <div className="command-detail space-y-4">
            <div>
              <p className="font-semibold mb-1 text-sm">
                Scan fails with a native module error
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                Missing build tools. macOS:{" "}
                <code className="text-[var(--color-accent)]">
                  xcode-select --install
                </code>
                . Linux:{" "}
                <code className="text-[var(--color-accent)]">
                  sudo apt install build-essential python3
                </code>
                . Then try again.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1 text-sm">
                Scan finds 0 components
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                Whizmob looks in{" "}
                <code className="text-[var(--color-accent)]">~/.claude/</code>,{" "}
                <code className="text-[var(--color-accent)]">~/.cursor/</code>,
                and{" "}
                <code className="text-[var(--color-accent)]">~/.codex/</code>.
                If none exist, there&apos;s nothing to find yet.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1 text-sm">
                Demo shows &quot;No mobs discovered yet&quot;
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                Components exist but don&apos;t reference each other. Mobs
                appear when agents invoke skills or share state. The full
                inventory is still available via{" "}
                <code className="text-[var(--color-accent)]">
                  npx whizmob dashboard
                </code>
                .
              </p>
            </div>
          </div>
        </details>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Footer */}
      <footer className="w-full max-w-3xl mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--color-muted)]">
        <div className="flex gap-6">
          <a
            href="https://github.com/gcquraishi/whizmob"
            className="hover:text-[var(--color-fg)] transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/whizmob"
            className="hover:text-[var(--color-fg)] transition-colors"
          >
            npm
          </a>
        </div>
        <p>MIT License</p>
      </footer>
    </main>
  );
}
