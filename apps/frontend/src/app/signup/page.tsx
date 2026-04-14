"use client";

import { useState } from "react";
import Link from "next/link";
import { useSignup } from "@/hooks/useAuth";
import { F, C } from "@/lib/design";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signup = useSignup();

  const submit = () =>
    signup.mutate({ username, password, email: email || undefined });

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
          Yay, New Friend!
        </h2>

        {(["username", "email", "password"] as const).map(field => (
          <input
            key={field}
            type={field === "password" ? "password" : field === "email" ? "email" : "text"}
            placeholder={
              field === "username" ? "Username" :
              field === "email"    ? "Email address (optional)" :
                                     "Password"
            }
            value={field === "username" ? username : field === "email" ? email : password}
            onChange={e =>
              field === "username" ? setUsername(e.target.value) :
              field === "email"    ? setEmail(e.target.value)    :
              setPassword(e.target.value)
            }
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{
              width: "100%", padding: "11px 14px",
              border: "none", borderBottom: "1.5px solid #D4C5A9",
              background: "transparent",
              fontFamily: F.serif, fontSize: 14, color: C.text2, outline: "none",
            }}
          />
        ))}

        {signup.isError && (
          <p style={{ color: "#C45B4A", fontSize: 12 }}>
            {(signup.error as Error)?.message || "Signup failed"}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={signup.isPending}
          style={{
            width: "100%", padding: 12,
            background: C.text2, color: C.bg,
            border: "none", borderRadius: 20,
            fontSize: 15, fontFamily: F.serif,
            cursor: "pointer", marginTop: 4, fontWeight: 500,
            opacity: signup.isPending ? .7 : 1,
          }}
        >
          {signup.isPending ? "Creating…" : "Sign Up"}
        </button>

        <Link href="/login" style={{
          textAlign: "center",
          color: C.text3, fontSize: 12, fontFamily: F.serif,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>
          We&apos;re already friends!
        </Link>
      </div>
    </main>
  );
}
