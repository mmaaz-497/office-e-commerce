"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/app/actions/admin/login";

export function LoginForm({
  labels,
  errorMessages,
}: {
  labels: { username: string; password: string; submit: string; submitting: string };
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorKey(null);

    const result = await login({ username, password });

    setSubmitting(false);
    if (result.ok) {
      router.push("/admin/dashboard");
      router.refresh();
    } else {
      setErrorKey(result.errorKey);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.username}</span>
        <input
          required
          autoComplete="username"
          className="border-brown rounded border px-3 py-2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.password}</span>
        <input
          required
          type="password"
          autoComplete="current-password"
          className="border-brown rounded border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {errorKey && <p className="text-sm text-red-700">{errorMessages[errorKey] ?? errorKey}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
