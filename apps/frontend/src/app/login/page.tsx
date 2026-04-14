"use client";

import { useState } from "react";
import Link from "next/link";
import { useLogin } from "@/hooks/useAuth";
import { F, C } from "@/lib/design";

const EyeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M1 6.5s2.3-3.7 5.5-3.7S12 6.5 12 6.5s-2.3 3.7-5.5 3.7S1 6.5 1 6.5z" stroke="currentColor" strokeWidth="1.1"/>
    <circle cx="6.5" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M1 6.5s2.3-3.7 5.5-3.7S12 6.5 12 6.5s-2.3 3.7-5.5 3.7S1 6.5 1 6.5z" stroke="currentColor" strokeWidth="1.1"/>
    <path d="M2 11L11 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const login = useLogin();

  return (
    <main style={{
      width: "100%", minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: C.bg, fontFamily: F.serif,
    }}>
      <div style={{ width: 350, padding: "32px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 44, marginBottom: 2 }}>🌵</div>
          <span style={{ fontSize: 26, fontWeight: 600, color: C.text2, fontStyle: "italic" }}>Tobalá</span>
          <p style={{ fontFamily: F.mono, fontSize: 8, color: C.text3, opacity: .5, marginTop: 3, letterSpacing: .5 }}>
            ZETTELKASTEN · POWERED BY AGAVE
          </p>
        </div>

        <h2 style={{ fontSize: 21, color: C.text2, textAlign: "center", fontWeight: 500, fontStyle: "italic", margin: "4px 0 8px" }}>
          Yay, You&apos;re Back!
        </h2>

        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login.mutate({ username, password })}
          style={{
            width: "100%", padding: "11px 14px",
            border: "none", borderBottom: "1.5px solid #D4C5A9",
            background: "transparent",
            fontFamily: F.serif, fontSize: 14, color: C.text2, outline: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login.mutate({ username, password })}
            style={{
              width: "100%", padding: "11px 14px",
              border: "none", borderBottom: "1.5px solid #D4C5A9",
              background: "transparent",
              fontFamily: F.serif, fontSize: 14, color: C.text2, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: C.text3, padding: 4, display: "flex",
            }}
          >
            {showPw ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>

        {login.isError && (
          <p style={{ color: "#C45B4A", fontSize: 12 }}>
            {(login.error as Error)?.message || "Login failed"}
          </p>
        )}

        <button
          type="button"
          onClick={() => login.mutate({ username, password })}
          disabled={login.isPending}
          style={{
            width: "100%", padding: 12,
            background: C.text2, color: C.bg,
            border: "none", borderRadius: 20,
            fontSize: 15, fontFamily: F.serif,
            cursor: "pointer", marginTop: 4, fontWeight: 500,
            opacity: login.isPending ? .7 : 1,
          }}
        >
          {login.isPending ? "Signing in…" : "Login"}
        </button>

        <Link href="/signup" style={{
          textAlign: "center",
          background: "none", color: C.text3,
          fontSize: 12, fontFamily: F.serif,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>
          Oops! I&apos;ve never been here before
        </Link>
      </div>
    </main>
  );
}
