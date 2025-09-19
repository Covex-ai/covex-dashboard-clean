"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { useRouter, usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      setAuthed(has);
      setReady(true);
      if (!has) router.replace("/login");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        setAuthed(true);
        if (pathname === "/login") router.replace("/dashboard");
      }
      if (event === "SIGNED_OUT") {
        setAuthed(false);
        router.replace("/login");
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  if (!ready || !authed) return null;

  return (
    <div className="flex min-h-screen bg-cx-bg text-cx-text">
      <Sidebar />
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
