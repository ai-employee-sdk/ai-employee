const AGENT_NAME = process.env.AGENT_NAME ?? "Coworker";
const DEPLOYMENT_MODE =
  process.env.KV_REST_API_URL ? "Vercel (KV store)" : "Local (file store)";

const MEMBRANE_TIERS = [
  { tier: "AUTO", tools: ["readChannel", "lookupUser", "saveMemory", "searchMemory"], description: "Executes immediately" },
  { tier: "DRAFT", tools: ["replyInThread"], description: "Executes and is logged" },
  { tier: "CONFIRM", tools: ["postToChannel"], description: "Requires approval" },
];

export default function StatusPage() {
  return (
    <main>
      <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        {AGENT_NAME}
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        AI coworker for Slack — powered by the <code>ai-employee</code> SDK
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>Status</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: "480px" }}>
          <tbody>
            <tr>
              <td style={tdLabel}>Deployment mode</td>
              <td style={tdValue}>{DEPLOYMENT_MODE}</td>
            </tr>
            <tr>
              <td style={tdLabel}>Model</td>
              <td style={tdValue}>gpt-4o-mini</td>
            </tr>
            <tr>
              <td style={tdLabel}>Events endpoint</td>
              <td style={tdValue}><code>/api/slack/events</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
          Membrane Tiers
        </h2>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: "640px" }}>
          <thead>
            <tr>
              <th style={thStyle}>Tier</th>
              <th style={thStyle}>Tools</th>
              <th style={thStyle}>Behaviour</th>
            </tr>
          </thead>
          <tbody>
            {MEMBRANE_TIERS.map(({ tier, tools, description }) => (
              <tr key={tier}>
                <td style={tdLabel}><code>{tier}</code></td>
                <td style={tdValue}>{tools.join(", ")}</td>
                <td style={tdValue}>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
          Quick Setup
        </h2>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: "1.8" }}>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Slack credentials</li>
          <li>Import <code>manifest.json</code> in your Slack app settings</li>
          <li>Set the events URL to <code>https://your-domain/api/slack/events</code></li>
          <li>Invite the bot to a channel and mention it with <code>@Coworker hello</code></li>
        </ol>
      </section>
    </main>
  );
}

const tdLabel: React.CSSProperties = {
  padding: "6px 12px 6px 0",
  color: "#666",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const tdValue: React.CSSProperties = {
  padding: "6px 0",
  verticalAlign: "top",
};

const thStyle: React.CSSProperties = {
  padding: "6px 12px 6px 0",
  textAlign: "left",
  fontWeight: "600",
  borderBottom: "1px solid #eee",
};
