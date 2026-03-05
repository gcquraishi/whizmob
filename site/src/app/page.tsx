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

      {/* Prerequisites */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">Prerequisites</h2>
        <ul className="space-y-3 text-[var(--color-fg)]">
          <li>
            <strong>Node.js 20+</strong>{" "}
            <span className="text-[var(--color-muted)]">
              &mdash; check with{" "}
              <code className="text-[var(--color-accent)]">node --version</code>
            </span>
          </li>
          <li>
            <strong>macOS:</strong>{" "}
            <span className="text-[var(--color-muted)]">
              Xcode command-line tools &mdash;{" "}
              <code className="text-[var(--color-accent)]">
                xcode-select --install
              </code>
            </span>
          </li>
          <li>
            <strong>Linux:</strong>{" "}
            <span className="text-[var(--color-muted)]">
              <code className="text-[var(--color-accent)]">
                build-essential
              </code>{" "}
              and{" "}
              <code className="text-[var(--color-accent)]">python3</code>{" "}
              packages
            </span>
          </li>
          <li>
            <strong>At least one AI tool installed:</strong>{" "}
            <span className="text-[var(--color-muted)]">
              Claude Code, Cursor, or Codex
            </span>
          </li>
        </ul>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* What it finds */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">What it finds</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                <th className="py-3 pr-8 font-medium">Location</th>
                <th className="py-3 font-medium">What it finds</th>
              </tr>
            </thead>
            <tbody className="font-[family-name:var(--font-mono)] text-sm">
              <tr className="border-b border-[var(--color-border)]">
                <td className="py-3 pr-8 text-[var(--color-accent)]">
                  ~/.claude/
                </td>
                <td className="py-3 text-[var(--color-muted)]">
                  Agents, skills, MCP servers, settings
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border)]">
                <td className="py-3 pr-8 text-[var(--color-accent)]">
                  ~/.cursor/
                </td>
                <td className="py-3 text-[var(--color-muted)]">
                  Agents, MCP servers, settings
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border)]">
                <td className="py-3 pr-8 text-[var(--color-accent)]">
                  ~/.codex/
                </td>
                <td className="py-3 text-[var(--color-muted)]">Skills</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[var(--color-muted)] mt-4">
          Also scans project directories for per-project{" "}
          <code className="text-[var(--color-accent)]">.claude/</code> configs.
          After finding components, it reads source files to detect connections
          &mdash; agents referencing configs, skills invoking other skills,
          shared state files. Connected components get grouped into{" "}
          <strong className="text-[var(--color-fg)]">mobs</strong>.
        </p>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Inspector preview */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">The inspector</h2>
        <p className="text-[var(--color-muted)] mb-6">
          Run{" "}
          <code className="text-[var(--color-accent)]">
            npx whizmob dashboard
          </code>{" "}
          for a full interactive dashboard at{" "}
          <code className="text-[var(--color-accent)]">localhost:3333</code>{" "}
          with mob graphs, searchable inventory, and import tools.
        </p>
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/inspector-preview.svg"
            alt="Whizmob Mob Inspector — three-panel layout showing discovered mobs, force-directed graph, and component detail cards"
            className="w-full"
          />
        </div>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Portability */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">
          Move agents between machines
        </h2>

        <h3 className="text-lg font-semibold mb-3 text-[var(--color-muted)]">
          1. Define a mob
        </h3>
        <div className="terminal mb-6">
          <div>
            <span className="prompt">$ </span>npx whizmob mob define
            &quot;my-setup&quot; --add code-reviewer test-runner linter
          </div>
        </div>

        <h3 className="text-lg font-semibold mb-3 text-[var(--color-muted)]">
          2. Export
        </h3>
        <div className="terminal mb-2">
          <div>
            <span className="prompt">$ </span>npx whizmob export my-setup
          </div>
        </div>
        <p className="text-sm text-[var(--color-muted)] mb-6">
          Rewrites absolute paths to placeholders, strips secrets, bootstraps
          memory files. Copy the folder to the new machine however you like.
        </p>

        <h3 className="text-lg font-semibold mb-3 text-[var(--color-muted)]">
          3. Import
        </h3>
        <div className="terminal mb-2">
          <div>
            <span className="prompt">$ </span>npx whizmob import
            ./path/to/my-setup --dry-run
          </div>
          <div className="output mt-1">Preview what will be installed...</div>
        </div>
        <div className="terminal mb-2">
          <div>
            <span className="prompt">$ </span>npx whizmob import
            ./path/to/my-setup
          </div>
        </div>

        <h3 className="text-lg font-semibold mt-8 mb-3 text-[var(--color-muted)]">
          4. Update later
        </h3>
        <div className="terminal mb-2">
          <div>
            <span className="prompt">$ </span>npx whizmob update
            ./path/to/my-setup
          </div>
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          Three-way comparison: upstream-only changes auto-apply, local-only
          changes are preserved, both-changed files show you the diff.
        </p>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* All commands */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">All commands</h2>
        <div className="terminal">
          <div className="comment"># Discover your agents</div>
          <div>
            <span className="prompt">$ </span>npx whizmob scan
            <span className="comment">
              {"                  "}# Scan all platforms
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob stats
            <span className="comment">
              {"                 "}# Summary of what was found
            </span>
          </div>
          <div className="mt-3 comment"># Visualize</div>
          <div>
            <span className="prompt">$ </span>npx whizmob demo --open
            <span className="comment">
              {"           "}# Interactive graph in browser
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob dashboard
            <span className="comment">
              {"             "}# Full dashboard at localhost:3333
            </span>
          </div>
          <div className="mt-3 comment"># Search</div>
          <div>
            <span className="prompt">$ </span>npx whizmob roster -s
            &quot;deploy&quot;
            <span className="comment">
              {"    "}# Search by name or purpose
            </span>
          </div>
          <div className="mt-3 comment"># Manage mobs</div>
          <div>
            <span className="prompt">$ </span>npx whizmob mob list
            <span className="comment">
              {"              "}# List defined mobs
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob mob show my-setup
            <span className="comment">
              {"     "}# Show mob details
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob mob define
            &quot;name&quot; --add a1 a2
            <span className="comment"> # Create a mob</span>
          </div>
          <div className="mt-3 comment"># Move agents between machines</div>
          <div>
            <span className="prompt">$ </span>npx whizmob export my-setup
            <span className="comment">
              {"       "}# Bundle for transfer
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob import ./bundle
            <span className="comment">
              {"       "}# Install a bundle
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob update ./bundle
            <span className="comment">
              {"       "}# Sync changes
            </span>
          </div>
          <div>
            <span className="prompt">$ </span>npx whizmob import --list
            <span className="comment">
              {"         "}# Pre-built mobs
            </span>
          </div>
        </div>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* How it works */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">How it works</h2>
        <p className="text-[var(--color-muted)] mb-4">
          Everything runs locally. No server, no cloud, no accounts.
        </p>
        <ul className="space-y-3 text-[var(--color-muted)] text-sm">
          <li>
            The <strong className="text-[var(--color-fg)]">scanner</strong>{" "}
            reads config files from{" "}
            <code className="text-[var(--color-accent)]">~/.claude/</code>,{" "}
            <code className="text-[var(--color-accent)]">~/.cursor/</code>, and{" "}
            <code className="text-[var(--color-accent)]">~/.codex/</code>
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">Edge inference</strong>{" "}
            reads source files to find references between components
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">Clustering</strong>{" "}
            groups connected components into mobs via graph traversal
          </li>
          <li>
            A{" "}
            <strong className="text-[var(--color-fg)]">SQLite database</strong>{" "}
            at{" "}
            <code className="text-[var(--color-accent)]">
              ~/.whizmob/whizmob.db
            </code>{" "}
            stores everything
          </li>
          <li>
            <strong className="text-[var(--color-fg)]">Exports</strong> are
            plain folders with a{" "}
            <code className="text-[var(--color-accent)]">manifest.json</code>{" "}
            &mdash; no binaries, git-friendly
          </li>
        </ul>
      </section>

      <hr className="w-full max-w-3xl mx-auto border-[var(--color-border)]" />

      {/* Troubleshooting */}
      <section className="w-full max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-6">Troubleshooting</h2>
        <div className="space-y-6">
          <div>
            <p className="font-semibold mb-1">
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
            <p className="font-semibold mb-1">Scan finds 0 components</p>
            <p className="text-sm text-[var(--color-muted)]">
              Whizmob looks in{" "}
              <code className="text-[var(--color-accent)]">~/.claude/</code>,{" "}
              <code className="text-[var(--color-accent)]">~/.cursor/</code>,
              and{" "}
              <code className="text-[var(--color-accent)]">~/.codex/</code>. If
              none of these exist, there&apos;s nothing to find. Install an AI
              tool, create an agent or skill, then scan again.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">
              Demo shows &quot;No mobs discovered yet&quot;
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              Components exist but don&apos;t reference each other yet. Mobs
              appear when agents invoke skills, share state files, or reference
              each other&apos;s configs. The full inventory is still available
              via{" "}
              <code className="text-[var(--color-accent)]">
                npx whizmob dashboard
              </code>{" "}
              at{" "}
              <code className="text-[var(--color-accent)]">/agents</code>.
            </p>
          </div>
        </div>
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
