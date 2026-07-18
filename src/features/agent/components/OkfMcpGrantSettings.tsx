import { useEffect, useState } from "react";
import { Check, Copy, PlugZap } from "lucide-react";
import { createOkfMcpGrant } from "@/shared/ipc.ts";
import type { OkfMcpLaunchGrant } from "@/shared/ipc.ts";
import "./OkfMcpGrantSettings.css";

interface OkfMcpGrantControlProps {
  grant?: OkfMcpLaunchGrant | null;
  busy?: boolean;
  copied?: boolean;
  error?: string | null;
  onCreate: () => void;
  onCopy: () => void;
}

export function OkfMcpGrantControl({
  grant = null,
  busy = false,
  copied = false,
  error = null,
  onCreate,
  onCopy,
}: OkfMcpGrantControlProps) {
  const descriptor = grant ? grantDescriptor(grant) : null;
  return (
    <section className="okf-mcp-grant" aria-labelledby="okf-mcp-grant-title">
      <header>
        <span className="okf-mcp-grant__mark" aria-hidden="true"><PlugZap size={16} /></span>
        <div>
          <h2 id="okf-mcp-grant-title" className="field-label">Use this bundle from another agent</h2>
          <p>
            Create a read-only MCP descriptor that expires after 60 seconds and works once.
            It cannot stage or apply writes.
          </p>
        </div>
      </header>

      {descriptor && (
        <div className="okf-mcp-grant__ready" role="status">
          <label htmlFor="okf-mcp-descriptor">One-shot MCP descriptor</label>
          <textarea id="okf-mcp-descriptor" value={descriptor} readOnly rows={6} spellCheck={false} />
          <button type="button" className="btn" onClick={onCopy}>
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied ? "Copied" : "Copy descriptor"}
          </button>
        </div>
      )}

      {error && <p className="okf-mcp-grant__error" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={busy} onClick={onCreate}>
        {busy ? "Creating grant…" : grant ? "Replace grant" : "Create one-shot grant"}
      </button>
    </section>
  );
}

export function OkfMcpGrantSettings({ bundleRoot }: { bundleRoot: string }) {
  const [grant, setGrant] = useState<OkfMcpLaunchGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!grant) return;
    const remaining = Math.max(0, grant.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setGrant(null);
      setCopied(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [grant]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setGrant(await createOkfMcpGrant(bundleRoot));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    setBusy(false);
  }

  async function copy() {
    if (!grant) return;
    try {
      await navigator.clipboard.writeText(grantDescriptor(grant));
      setCopied(true);
    } catch {
      setError("Studio could not copy the descriptor. Select the text and copy it manually.");
    }
  }

  return (
    <OkfMcpGrantControl
      grant={grant}
      busy={busy}
      copied={copied}
      error={error}
      onCreate={() => void create()}
      onCopy={() => void copy()}
    />
  );
}

function grantDescriptor(grant: OkfMcpLaunchGrant): string {
  return JSON.stringify({
    mcpServers: {
      "okf-studio": {
        command: grant.command,
        args: grant.args,
      },
    },
  }, null, 2);
}
