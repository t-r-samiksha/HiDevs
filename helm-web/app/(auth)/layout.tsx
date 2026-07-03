import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white">
            ⎈
          </div>
          <h1 className="text-2xl font-semibold text-white">Helm</h1>
          <p className="text-sm text-slate-400">Meeting intelligence platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
