'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [businessId, setBusinessId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setMsg('You are not signed in (mock login is OK).');
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', uid)
        .maybeSingle();

      if (data?.business_id) setBusinessId(data.business_id as string);
      setLoading(false);
    })();
  }, [supabase]);

  async function save() {
    setSaving(true);
    setMsg(null);

    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setMsg('No auth user (mock login). Use the Settings field but it will not persist.');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid, business_id: businessId });

    setMsg(error ? error.message : 'Saved.');
    setSaving(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="text-[#dcdfe6] text-xl">Settings</div>

      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5 space-y-3 max-w-xl">
        <label className="block text-sm text-[#9aa2ad]">Business UUID</label>
        <input
          className="w-full bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6] placeholder-[#9aa2ad]"
          placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          disabled={loading || saving}
        />

        <button
          onClick={save}
          disabled={saving}
          className="bg-[#3b82f6] hover:opacity-90 text-white rounded-xl px-4 py-2"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {msg && <div className="text-sm text-[#9aa2ad]">{msg}</div>}
        <div className="text-xs text-[#9aa2ad]">
          RLS scopes reads/writes to this business for your user.
        </div>
      </div>
    </div>
  );
}
