export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
      <h1>SBI Telemetry</h1>
      <p>Skill-usage collector. The webhook endpoint is:</p>
      <pre>POST /api/skill-usage</pre>
      <p>
        Health check: <a href="/api/skill-usage">/api/skill-usage</a>
      </p>
    </main>
  );
}
