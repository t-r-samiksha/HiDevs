"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { siteOrigin } from "@/lib/siteUrl";

type Role = "employee" | "manager" | "vp";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },
        // Send the confirmation link back to THIS deployment (not localhost).
        // Prefer NEXT_PUBLIC_SITE_URL when set (robust even if signup is ever
        // triggered from a non-browser origin), else fall back to the current
        // origin. Supabase still requires this URL to be allow-listed in the
        // dashboard (Authentication → URL Configuration → Redirect URLs).
        emailRedirectTo: `${siteOrigin()}/login?verified=1`,
      },
    });

    if (signUpErr) {
      setLoading(false);
      setError(signUpErr.message);
      return;
    }

    // Mirror the auth user into the public `users` table so role/manager
    // hierarchy queries work. If this fails, the account exists in auth but
    // has no profile row — manager/VP hierarchy and chat features would break
    // silently for them, so surface the error and back the sign-up out
    // instead of continuing into a half-created account.
    if (data.user) {
      const { error: insertErr } = await supabase.from("users").insert({
        id: data.user.id,
        name,
        email,
        role,
      });
      if (insertErr) {
        console.error("users insert failed:", insertErr.message);
        await supabase.auth.signOut();
        setLoading(false);
        setError(`Account setup incomplete: ${insertErr.message}. Please try signing up again.`);
        return;
      }
    }

    setLoading(false);

    // If email confirmation is enabled there is no session yet.
    if (data.session) {
      router.push("/");
    } else {
      setNotice("Account created. Check your email to confirm, then sign in.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"
    >
      <h2 className="text-lg font-semibold text-white">Create account</h2>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-green-800 bg-green-950 px-3 py-2 text-sm text-green-300">
          {notice}
        </div>
      )}

      <Field label="Name" type="text" value={name} onChange={setName} placeholder="Jane Doe" autoComplete="name" />
      <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="new-password" />

      <label className="block">
        <span className="mb-1 block text-sm text-slate-300">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="vp">VP</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create account"}
      </button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-400 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      <input
        type={type}
        required
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}
