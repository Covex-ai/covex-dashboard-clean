"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      setReady(true);
    })();
  }, [sb, router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
