"use client";

/** Last-resort boundary (root layout failed). Kept dependency-free on purpose. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f8f9fb", color: "#111827" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>The app hit an unexpected error. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
