"use client";

// Last-resort boundary (renders outside the root layout, so no i18n/theme providers here).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ padding: "10px 16px", borderRadius: 12, border: "1px solid #ddd", background: "white" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
