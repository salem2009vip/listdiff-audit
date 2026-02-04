import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ================= Helpers ================= */
function getRoomId() {
  const u = new URL(window.location.href);
  return u.searchParams.get("room") || "demo-room";
}
function getUrlKey() {
  const u = new URL(window.location.href);
  return u.searchParams.get("key") || "";
}
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}
function randKey() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function stripArabic(s) {
  // إزالة التشكيل + التطويل
  return (s || "")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\u0640/g, "");
}
function norm(s) {
  // تطبيع قوي (عربي + رموز)
  let x = stripArabic(s || "").toLowerCase();
  x = x
    .replace(/[.*=،,:;()\-_/\\]/g, " ")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
  return x;
}
function sumItems(items) {
  return (items || []).reduce((a, x) => a + (Number(x.value) || 0), 0);
}
function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parsePastedList(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const matches = line.match(/(\d[\d,]*\.?\d*)/g);
    if (!matches || matches.length === 0) continue;
    const rawNum = matches[matches.length - 1].replace(/,/g, "");
    const value = Number(rawNum);
    if (!Number.isFinite(value)) continue;

    const name = line
      .replace(/(\d[\d,]*\.?\d*)/g, " ")
      .replace(/[=*]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;

    items.push({ id: makeId(), name, value, note: "" });
  }
  return items;
}
function diffFinal(oldItems, newItems) {
  const o = new Map();
  const n = new Map();
  (oldItems || []).forEach((x) => {
    const k = norm(x.name);
    if (k && !o.has(k)) o.set(k, x);
  });
  (newItems || []).forEach((x) => {
    const k = norm(x.name);
    if (k && !n.has(k)) n.set(k, x);
  });

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [k, ov] of o.entries()) {
    const nv = n.get(k);
    if (!nv) removed.push(ov);
    else {
      const a = Number(ov.value) || 0;
      const b = Number(nv.value) || 0;
      if (Math.abs(a - b) < 0.000001) unchanged.push(nv);
      else changed.push({ name: ov.name, oldValue: a, newValue: b, diff: b - a });
    }
  }
  for (const [k, nv] of n.entries()) if (!o.has(k)) added.push(nv);
  const byName = (a, b) => norm(a.name).localeCompare(norm(b.name));
  added.sort(byName); removed.sort(byName); unchanged.sort(byName);
  changed.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return { added, removed, changed, unchanged };
}

/* ================= WhatsApp Summary ================= */
function generateWhatsAppSummary(events, roomId) {
  const evs = (events || []).slice().reverse();
  if (evs.length === 0) return `📌 ملخص واتساب (Room: ${roomId})\nما في تغييرات مسجلة حالياً.`;

  let adds = 0, dels = 0, ups = 0;
  let addSum = 0, delSum = 0, updNet = 0;

  const byWho = new Map();
  const getStats = (who) => {
    const key = (who || "غير معروف").trim() || "غير معروف";
    if (!byWho.has(key)) byWho.set(key, { addCount:0, delCount:0, updCount:0, addSum:0, delSum:0, updNet:0 });
    return byWho.get(key);
  };

  for (const e of evs) {
    const who = (e.who || "غير معروف").trim() || "غير معروف";
    const st = getStats(who);

    if (e.action === "add") {
      adds++; st.addCount++;
      if (Number.isFinite(Number(e.value_after))) { addSum += Number(e.value_after); st.addSum += Number(e.value_after); }
    } else if (e.action === "delete") {
      dels++; st.delCount++;
      if (Number.isFinite(Number(e.value_before))) { delSum += Number(e.value_before); st.delSum += Number(e.value_before); }
    } else if (e.action === "update") {
      ups++; st.updCount++;
      const vb = Number(e.value_before), va = Number(e.value_after);
      if (Number.isFinite(vb) && Number.isFinite(va)) { const d = va - vb; updNet += d; st.updNet += d; }
    }
  }

  const net = addSum - delSum + updNet;
  const people = Array.from(byWho.entries())
    .map(([who, st]) => ({ who, ...st, impact: st.addSum - st.delSum + st.updNet }))
    .sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact));

  const lines = [];
  lines.push(`📌 ملخص واتساب (Room: ${roomId})`);
  lines.push(`—`);
  lines.push(`✅ إضافات: ${adds} | قيمة تقريبية: ${formatMoney(addSum)}`);
  lines.push(`🗑️ حذف: ${dels} | قيمة تقريبية: ${formatMoney(delSum)}`);
  lines.push(`✏️ تعديلات: ${ups} | صافي التعديل: ${formatMoney(updNet)}`);
  lines.push(`📊 صافي الأثر (تقريبي): ${formatMoney(net)}`);
  lines.push(`—`);
  lines.push(`👤 حسب الشخص:`);
  for (const p of people) lines.push(`• ${p.who}: +${p.addCount}/-${p.delCount}/✏️${p.updCount} | صافي: ${formatMoney(p.impact)}`);

  lines.push(`—`);
  lines.push(`🕒 آخر تغييرات (الأحدث):`);
  for (const e of (events || []).slice(0, 5)) {
    const who = (e.who || "غير معروف").trim() || "غير معروف";
    const list = e.list_name ? `[${e.list_name}]` : "";
    if (e.action === "add") lines.push(`• ${who} ${list} أضاف: ${e.item_name_after || ""}`);
    else if (e.action === "delete") lines.push(`• ${who} ${list} حذف: ${e.item_name_before || ""}`);
    else lines.push(`• ${who} ${list} عدّل: ${e.item_name_before || ""}`);
  }
  return lines.join("\n");
}

/* ================= UI Small Components ================= */
function Card({ children }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e6e6e6", borderRadius:14, padding:12 }}>
      {children}
    </div>
  );
}
function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:"8px 10px", borderRadius:999,
        border: active ? "1px solid #0b57d0" : "1px solid #ddd",
        background:"#fff", cursor:"pointer"
      }}
    >
      {children}
    </button>
  );
}

function ItemsTable({
  title, items, canEdit,
  onAdd, onDelete, onName, onValue, onNote,
  search, setSearch,
  onClickItem
}) {
  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return items || [];
    return (items || []).filter((x) => norm(x.name).includes(q) || String(x.value ?? "").includes(search));
  }, [items, search]);

  return (
    <Card>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
        <h3 style={{ margin:0 }}>{title}</h3>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <input
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم…"
            style={{ padding:9, border:"1px solid #ddd", borderRadius:10, minWidth:220 }}
          />
          <button
            onClick={onAdd}
            disabled={!canEdit}
            style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEdit ? 1 : 0.5 }}
          >
            + إضافة سطر
          </button>
        </div>
      </div>

      <div style={{ overflowX:"auto", marginTop:10 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign:"right", padding:8, borderBottom:"1px solid #f1f1f1" }}>الشيء</th>
              <th style={{ textAlign:"right", padding:8, borderBottom:"1px solid #f1f1f1" }}>القيمة</th>
              <th style={{ textAlign:"right", padding:8, borderBottom:"1px solid #f1f1f1" }}>ملاحظة</th>
              <th style={{ padding:8, borderBottom:"1px solid #f1f1f1" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id}>
                <td style={{ padding:8, borderBottom:"1px solid #f7f7f7" }}>
                  <input
                    value={x.name || ""}
                    onChange={(e)=>onName(x.id, e.target.value)}
                    onFocus={()=>onClickItem?.(x)}
                    placeholder="مثال: مطبخ خارجي"
                    disabled={!canEdit}
                    style={{ width:"100%", padding:9, borderRadius:10, border:"1px solid #ddd", opacity: canEdit?1:0.7 }}
                  />
                </td>
                <td style={{ padding:8, borderBottom:"1px solid #f7f7f7" }}>
                  <input
                    type="number"
                    value={x.value ?? ""}
                    onChange={(e)=>onValue(x.id, e.target.value === "" ? "" : Number(e.target.value))}
                    onFocus={()=>onClickItem?.(x)}
                    placeholder="0"
                    disabled={!canEdit}
                    style={{ width:"100%", padding:9, borderRadius:10, border:"1px solid #ddd", opacity: canEdit?1:0.7 }}
                  />
                </td>
                <td style={{ padding:8, borderBottom:"1px solid #f7f7f7" }}>
                  <input
                    value={x.note || ""}
                    onChange={(e)=>onNote(x.id, e.target.value)}
                    onFocus={()=>onClickItem?.(x)}
                    placeholder="مثال: دفعة / تم الاستلام"
                    disabled={!canEdit}
                    style={{ width:"100%", padding:9, borderRadius:10, border:"1px solid #ddd", opacity: canEdit?1:0.7 }}
                  />
                </td>
                <td style={{ padding:8, borderBottom:"1px solid #f7f7f7", textAlign:"center" }}>
                  <button
                    onClick={()=>onDelete(x.id)}
                    disabled={!canEdit}
                    style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEdit?1:0.5 }}
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} style={{ padding:8, color:"#666" }}>ما في نتائج.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EventsTab({ events }) {
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [whoFilter, setWhoFilter] = useState("all");

  const whoOptions = useMemo(() => {
    const s = new Set((events||[]).map(e => (e.who||"غير معروف").trim() || "غير معروف"));
    return ["all", ...Array.from(s)];
  }, [events]);

  const filtered = useMemo(() => {
    const qq = norm(q);
    return (events || []).filter(e => {
      if (listFilter !== "all" && e.list_name !== listFilter) return false;
      if (typeFilter !== "all" && e.action !== typeFilter) return false;
      const who = (e.who||"غير معروف").trim() || "غير معروف";
      if (whoFilter !== "all" && who !== whoFilter) return false;

      if (!qq) return true;
      const txt = norm(
        `${e.item_name_before||""} ${e.item_name_after||""} ${who} ${e.list_name||""} ${e.action||""}`
      );
      return txt.includes(qq);
    });
  }, [events, q, listFilter, typeFilter, whoFilter]);

  return (
    <Card>
      <h3 style={{ marginTop:0 }}>سجل التغييرات</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="بحث…" style={{ padding:9, border:"1px solid #ddd", borderRadius:10, minWidth:220 }} />
        <select value={listFilter} onChange={(e)=>setListFilter(e.target.value)} style={{ padding:9, border:"1px solid #ddd", borderRadius:10 }}>
          <option value="all">كل القوائم</option>
          <option value="old">القديمة</option>
          <option value="new">الجديدة</option>
        </select>
        <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)} style={{ padding:9, border:"1px solid #ddd", borderRadius:10 }}>
          <option value="all">كل الأنواع</option>
          <option value="add">إضافة</option>
          <option value="delete">حذف</option>
          <option value="update">تعديل</option>
        </select>
        <select value={whoFilter} onChange={(e)=>setWhoFilter(e.target.value)} style={{ padding:9, border:"1px solid #ddd", borderRadius:10 }}>
          {whoOptions.map(w => <option key={w} value={w}>{w==="all"?"كل الأشخاص":w}</option>)}
        </select>
      </div>

      <div style={{ marginTop:10 }}>
        {filtered.length === 0 && <div style={{ color:"#666" }}>لا يوجد نتائج.</div>}
        {filtered.map((ev) => {
          const who = (ev.who||"غير معروف").trim() || "غير معروف";
          const when = new Date(ev.created_at).toLocaleString();
          const vb = Number(ev.value_before), va = Number(ev.value_after);
          const hasNums = Number.isFinite(vb) || Number.isFinite(va);

          return (
            <div key={ev.id} style={{ padding:"10px 0", borderBottom:"1px solid #f1f1f1" }}>
              <div style={{ color:"#666", fontSize:13 }}><b>{who}</b> — {when}</div>
              <div style={{ marginTop:4 }}>
                <b>[{ev.list_name}]</b>{" "}
                {ev.action === "add" && <>➕ أضاف: <b>{ev.item_name_after || ""}</b></>}
                {ev.action === "delete" && <>🗑️ حذف: <b>{ev.item_name_before || ""}</b></>}
                {ev.action === "update" && <>✏️ عدّل: <b>{ev.item_name_before || ""}</b> → <b>{ev.item_name_after || ev.item_name_before || ""}</b></>}
                {hasNums && <> | {formatMoney(ev.value_before)} → {formatMoney(ev.value_after)}</>}
                {ev.note_after ? <> | 📝 {ev.note_after}</> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FinalTab({ oldItems, newItems, events, roomId }) {
  const oldT = sumItems(oldItems);
  const newT = sumItems(newItems);
  const d = diffFinal(oldItems, newItems);
  const [summary, setSummary] = useState("");

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      alert("✅ تم نسخ الملخص");
    } catch {
      alert("انسخي يدويًا من المربع.");
    }
  }

  const boxStyle = (kind) => {
    if (kind === "add") return { background:"#ecfdf3", border:"1px solid #b7f0c8" };    // أخضر
    if (kind === "del") return { background:"#fff1f1", border:"1px solid #ffcccc" };    // أحمر
    if (kind === "chg") return { background:"#fff7ed", border:"1px solid #ffd7aa" };    // برتقالي
    return { background:"#f7f7f7", border:"1px solid #e6e6e6" };
  };

  return (
    <>
      <Card>
        <h3 style={{ marginTop:0 }}>النتيجة النهائية</h3>
        <div style={{ color:"#666", fontSize:13 }}>
          مجموع القديمة: <b>{formatMoney(oldT)}</b> | مجموع الجديدة: <b>{formatMoney(newT)}</b> | الفرق: <b>{formatMoney(newT-oldT)}</b>
        </div>

        <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
          <button
            onClick={() => setSummary(generateWhatsAppSummary(events, roomId))}
            style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}
          >
            🧠 ملخص واتساب
          </button>
          <button
            onClick={copySummary}
            disabled={!summary}
            style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: summary?1:0.5 }}
          >
            📋 نسخ
          </button>
        </div>

        {summary && (
          <textarea
            value={summary}
            readOnly
            rows={10}
            style={{ width:"100%", marginTop:10, padding:10, border:"1px solid #ddd", borderRadius:10 }}
          />
        )}
      </Card>

      <div style={{ display:"grid", gap:12, marginTop:12 }}>
        <Card>
          <div style={{ display:"grid", gap:10 }}>
            <div style={{ padding:10, borderRadius:12, ...boxStyle("add") }}>
              <b>➕ إضافات ({d.added.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.added.map(x => <li key={x.id}>{x.name} — {formatMoney(x.value)}</li>)}
              </ul>
            </div>

            <div style={{ padding:10, borderRadius:12, ...boxStyle("del") }}>
              <b>➖ محذوف ({d.removed.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.removed.map(x => <li key={x.id}>{x.name} — {formatMoney(x.value)}</li>)}
              </ul>
            </div>

            <div style={{ padding:10, borderRadius:12, ...boxStyle("chg") }}>
              <b>✏️ تغيّر ({d.changed.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.changed.map((x,i) => <li key={i}>{x.name}: {formatMoney(x.oldValue)} → {formatMoney(x.newValue)} (Δ {formatMoney(x.diff)})</li>)}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ================= App ================= */
export default function App() {
  const roomId = getRoomId();
  const urlKey = getUrlKey();

  const [tab, setTab] = useState("final");
  const [status, setStatus] = useState("loading...");

  const [who, setWho] = useState(localStorage.getItem("listdiff_who") || "");
  const [ready, setReady] = useState(!!(localStorage.getItem("listdiff_who") || "").trim());

  const [room, setRoom] = useState(null);
  const [oldItems, setOldItems] = useState([]);
  const [newItems, setNewItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [versions, setVersions] = useState([]);

  const [pasteOldOpen, setPasteOldOpen] = useState(false);
  const [pasteNewOpen, setPasteNewOpen] = useState(false);
  const [pasteOldText, setPasteOldText] = useState("");
  const [pasteNewText, setPasteNewText] = useState("");

  const [searchOld, setSearchOld] = useState("");
  const [searchNew, setSearchNew] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemHistory, setItemHistory] = useState([]);

  const [pinInput, setPinInput] = useState("");

  const blockLog = useRef(false);

  /* ---------- Permissions (7) ---------- */
  const mode = useMemo(() => {
    if (!room) return { canEdit: false, canView: true, role: "loading" };
    if (urlKey && urlKey === room.edit_key) return { canEdit: !room.is_locked, canView: true, role: "editor" };
    if (urlKey && urlKey === room.view_key) return { canEdit: false, canView: true, role: "viewer" };
    // بدون key: عرض فقط
    return { canEdit: false, canView: true, role: "guest" };
  }, [room, urlKey]);

  /* ---------- Load room + events + versions ---------- */
  useEffect(() => {
    let alive = true;

    async function load() {
      setStatus("loading room...");
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();

      if (!alive) return;
      if (error) { setStatus("error: " + error.message); return; }

      if (!data) {
        const seed = {
          id: roomId,
          old_items: [{ id: makeId(), name: "", value: "", note: "" }],
          new_items: [{ id: makeId(), name: "", value: "", note: "" }],
          edit_key: randKey(),
          view_key: randKey(),
          is_locked: false,
          lock_pin: null
        };
        const ins = await supabase.from("rooms").insert(seed);
        if (ins.error) { setStatus("error: " + ins.error.message); return; }
        setRoom(seed);
        setOldItems(seed.old_items);
        setNewItems(seed.new_items);
        setStatus("room created ✅");
      } else {
        // إذا قديم وما فيه keys نضيفهم مرة وحدة
        if (!data.edit_key || !data.view_key) {
          const patch = { edit_key: data.edit_key || randKey(), view_key: data.view_key || randKey() };
          await supabase.from("rooms").update(patch).eq("id", roomId);
          data.edit_key = patch.edit_key; data.view_key = patch.view_key;
        }
        setRoom(data);
        setOldItems(data.old_items || []);
        setNewItems(data.new_items || []);
        setStatus("connected ✅");
      }

      const ev = await supabase
        .from("room_events")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (!alive) return;
      if (!ev.error) setEvents(ev.data || []);

      const vv = await supabase
        .from("room_versions")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!alive) return;
      if (!vv.error) setVersions(vv.data || []);
    }

    load();
    return () => { alive = false; };
  }, [roomId]);

  /* ---------- Realtime ---------- */
  useEffect(() => {
    const chRooms = supabase
      .channel("rooms-live")
      .on("postgres_changes", { event: "*", schema:"public", table:"rooms", filter:`id=eq.${roomId}` }, (p) => {
        const row = p.new;
        if (!row) return;
        blockLog.current = true;
        setRoom(row);
        setOldItems(row.old_items || []);
        setNewItems(row.new_items || []);
        setStatus("synced ✅");
        setTimeout(() => (blockLog.current = false), 0);
      })
      .subscribe();

    const chEvents = supabase
      .channel("events-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"room_events", filter:`room_id=eq.${roomId}` }, (p) => {
        if (!p.new) return;
        setEvents((prev) => [p.new, ...prev].slice(0, 300));
      })
      .subscribe();

    const chVers = supabase
      .channel("versions-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"room_versions", filter:`room_id=eq.${roomId}` }, (p) => {
        if (!p.new) return;
        setVersions((prev) => [p.new, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chRooms);
      supabase.removeChannel(chEvents);
      supabase.removeChannel(chVers);
    };
  }, [roomId]);

  /* ---------- Save & Log ---------- */
  async function saveRoom(nextOld, nextNew, patchRoom = null) {
    const payload = {
      old_items: nextOld,
      new_items: nextNew,
      updated_at: new Date().toISOString(),
      ...(patchRoom || {})
    };
    const { error } = await supabase.from("rooms").update(payload).eq("id", roomId);
    if (error) setStatus("save error: " + error.message);
  }

  async function logEvent(e) {
    if (blockLog.current) return;
    const name = (localStorage.getItem("listdiff_who") || who || "Unknown").trim() || "Unknown";
    const payload = { room_id: roomId, who: name, ...e };
    const { error } = await supabase.from("room_events").insert(payload);
    if (error) setStatus("log error: " + error.message);
  }

  /* ---------- Lock (4) ---------- */
  async function lockRoom() {
    if (!room) return;
    if (!pinInput.trim()) { alert("حطي PIN للقفل (مثلاً 1234)"); return; }
    await saveRoom(oldItems, newItems, { is_locked: true, lock_pin: pinInput.trim() });
    await logEvent({ action:"update", list_name:"system", item_id:makeId(), item_name_before:"lock", item_name_after:"locked" });
    setPinInput("");
  }
  async function unlockRoom() {
    if (!room) return;
    if ((pinInput.trim() || "") !== (room.lock_pin || "")) { alert("PIN غير صحيح"); return; }
    await saveRoom(oldItems, newItems, { is_locked: false });
    await logEvent({ action:"update", list_name:"system", item_id:makeId(), item_name_before:"lock", item_name_after:"unlocked" });
    setPinInput("");
  }

  /* ---------- Operations (with note + history) ---------- */
  async function addRow(listName) {
    if (!mode.canEdit) return;
    const it = { id: makeId(), name:"", value:"", note:"" };
    if (listName === "old") {
      const next = [...oldItems, it];
      setOldItems(next);
      await saveRoom(next, newItems);
    } else {
      const next = [...newItems, it];
      setNewItems(next);
      await saveRoom(oldItems, next);
    }
    await logEvent({ action:"add", list_name:listName, item_id:it.id, item_name_after:"", value_after:null });
  }

  async function deleteRow(listName, itemId) {
    if (!mode.canEdit) return;
    const src = listName === "old" ? oldItems : newItems;
    const before = src.find(x => x.id === itemId);
    const next = src.filter(x => x.id !== itemId);

    if (listName === "old") { setOldItems(next); await saveRoom(next, newItems); }
    else { setNewItems(next); await saveRoom(oldItems, next); }

    await logEvent({
      action:"delete", list_name:listName, item_id:itemId,
      item_name_before: before?.name || "",
      value_before: before?.value === "" ? null : Number(before?.value),
      note_before: before?.note || ""
    });
  }

  async function updateField(listName, itemId, patch) {
    if (!mode.canEdit) return;
    const src = listName === "old" ? oldItems : newItems;
    const idx = src.findIndex(x => x.id === itemId);
    if (idx === -1) return;

    const before = src[idx];
    const after = { ...before, ...patch };
    const next = src.slice(); next[idx] = after;

    if (listName === "old") { setOldItems(next); await saveRoom(next, newItems); }
    else { setNewItems(next); await saveRoom(oldItems, next); }

    await logEvent({
      action:"update",
      list_name:listName,
      item_id:itemId,
      item_name_before: before.name || "",
      item_name_after: after.name || before.name || "",
      value_before: before.value === "" ? null : Number(before.value),
      value_after: after.value === "" ? null : Number(after.value),
      note_before: before.note || "",
      note_after: after.note || ""
    });
  }

  async function importPaste(listName, pastedText) {
    if (!mode.canEdit) return;
    const parsed = parsePastedList(pastedText);
    if (parsed.length === 0) return;

    if (listName === "old") {
      const merged = [...oldItems.filter(x => x.name || x.value !== "" || x.note), ...parsed];
      setOldItems(merged);
      await saveRoom(merged, newItems);
    } else {
      const merged = [...newItems.filter(x => x.name || x.value !== "" || x.note), ...parsed];
      setNewItems(merged);
      await saveRoom(oldItems, merged);
    }

    await logEvent({
      action:"add", list_name:listName, item_id:makeId(),
      item_name_after:`لصق قائمة (${parsed.length} بند)`,
      value_after: parsed.reduce((a,x)=>a+(Number(x.value)||0),0)
    });
  }

  /* ---------- (15) Item History ---------- */
  async function openItemHistory(item) {
    setSelectedItem(item);
    const id = item?.id;
    if (!id) { setItemHistory([]); return; }
    const hh = await supabase
      .from("room_events")
      .select("*")
      .eq("room_id", roomId)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItemHistory(hh.data || []);
  }

  /* ---------- (9) Versions ---------- */
  async function saveVersion(note) {
    if (!room) return;
    const savedBy = (localStorage.getItem("listdiff_who") || who || "Unknown").trim() || "Unknown";
    const { error } = await supabase.from("room_versions").insert({
      room_id: roomId,
      saved_by: savedBy,
      note: note || null,
      old_items: oldItems,
      new_items: newItems
    });
    if (error) alert("خطأ حفظ نسخة: " + error.message);
    else alert("✅ تم حفظ نسخة");
  }

  async function restoreVersion(v) {
    if (!mode.canEdit) { alert("صلاحية تعديل مطلوبة للاسترجاع."); return; }
    if (!v) return;
    blockLog.current = true;
    setOldItems(v.old_items || []);
    setNewItems(v.new_items || []);
    await saveRoom(v.old_items || [], v.new_items || []);
    setTimeout(()=> (blockLog.current = false), 0);
    await logEvent({ action:"update", list_name:"system", item_id:makeId(), item_name_before:"version", item_name_after:`restore ${v.id}` });
    alert("✅ تم استرجاع النسخة");
  }

  /* ---------- Who gate ---------- */
  if (!ready) {
    return (
      <div style={{ maxWidth: 900, margin:"0 auto", padding:14 }}>
        <Card>
          <h2 style={{ marginTop:0 }}>ادخلي اسمك</h2>
          <div style={{ color:"#666", fontSize:13 }}>الاسم ضروري للسجل والملخص.</div>
          <input
            value={who}
            onChange={(e)=>setWho(e.target.value)}
            placeholder="مثال: فاطمة"
            style={{ width:"100%", padding:10, border:"1px solid #ddd", borderRadius:10, marginTop:10 }}
          />
          <button
            onClick={() => { const w = who.trim(); if (!w) return; localStorage.setItem("listdiff_who", w); setReady(true); }}
            disabled={!who.trim()}
            style={{ marginTop:10, padding:"10px 12px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: who.trim()?1:0.5 }}
          >
            دخول
          </button>
        </Card>
      </div>
    );
  }

  const shareLinks = useMemo(() => {
    if (!room) return null;
    const base = new URL(window.location.href);
    base.searchParams.set("room", roomId);

    const edit = new URL(base.toString());
    edit.searchParams.set("key", room.edit_key);

    const view = new URL(base.toString());
    view.searchParams.set("key", room.view_key);

    return { edit: edit.toString(), view: view.toString() };
  }, [room, roomId]);

  const isLocked = !!room?.is_locked;
  const canEditNow = mode.role === "editor" && !isLocked;

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:14, background:"#fafafa", minHeight:"100vh" }}>
      <Card>
        <h2 style={{ margin:"0 0 6px 0" }}>مقارنة القوائم (مباشر + سجل + إصدارات)</h2>
        <div style={{ color:"#666", fontSize:13 }}>
          Room: <b>{roomId}</b> — أنت: <b>{localStorage.getItem("listdiff_who")}</b> — الدور: <b>{mode.role}</b> — الحالة: {status}
          {isLocked ? <> — 🔒 <b>مقفول</b></> : <> — 🔓 <b>مفتوح</b></>}
        </div>

        {shareLinks && (
          <div style={{ marginTop:10, color:"#666", fontSize:13 }}>
            <div>🔗 رابط التعديل (Editor): <a href={shareLinks.edit} target="_blank" rel="noreferrer">{shareLinks.edit}</a></div>
            <div>👀 رابط مشاهدة فقط (Viewer): <a href={shareLinks.view} target="_blank" rel="noreferrer">{shareLinks.view}</a></div>
          </div>
        )}

        <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
          <Tab active={tab==="final"} onClick={()=>setTab("final")}>النتيجة</Tab>
          <Tab active={tab==="old"} onClick={()=>setTab("old")}>القديمة</Tab>
          <Tab active={tab==="new"} onClick={()=>setTab("new")}>الجديدة</Tab>
          <Tab active={tab==="log"} onClick={()=>setTab("log")}>السجل</Tab>
          <Tab active={tab==="versions"} onClick={()=>setTab("versions")}>الإصدارات</Tab>
        </div>

        {/* (4) Lock/Unlock */}
        {mode.role === "editor" && (
          <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <input
              value={pinInput}
              onChange={(e)=>setPinInput(e.target.value)}
              placeholder="PIN (مثال 1234)"
              style={{ padding:9, border:"1px solid #ddd", borderRadius:10, minWidth:180 }}
            />
            {!isLocked ? (
              <button onClick={lockRoom} style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}>
                🔒 قفل القوائم
              </button>
            ) : (
              <button onClick={unlockRoom} style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}>
                🔓 فتح القوائم
              </button>
            )}
          </div>
        )}
      </Card>

      <div style={{ marginTop:12, display:"grid", gap:12 }}>
        {tab==="final" && <FinalTab oldItems={oldItems} newItems={newItems} events={events} roomId={roomId} />}

        {tab==="old" && (
          <>
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                <b>القائمة القديمة</b>
                <button
                  onClick={()=>setPasteOldOpen(true)}
                  disabled={!canEditNow}
                  style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEditNow?1:0.5 }}
                >
                  📋 لصق قائمة
                </button>
              </div>

              {pasteOldOpen && (
                <div style={{ marginTop:10 }}>
                  <div style={{ color:"#666", fontSize:13 }}>الصقي القائمة هنا (كل سطر اسم + رقم).</div>
                  <textarea
                    value={pasteOldText}
                    onChange={(e)=>setPasteOldText(e.target.value)}
                    rows={8}
                    style={{ width:"100%", padding:10, border:"1px solid #ddd", borderRadius:10, marginTop:8 }}
                  />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                    <button
                      onClick={()=>{ importPaste("old", pasteOldText); setPasteOldOpen(false); setPasteOldText(""); }}
                      disabled={!canEditNow}
                      style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEditNow?1:0.5 }}
                    >
                      تحويل وإضافة
                    </button>
                    <button onClick={()=>setPasteOldOpen(false)} style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}>إلغاء</button>
                  </div>
                </div>
              )}
            </Card>

            <ItemsTable
              title="تعديل القديمة"
              items={oldItems}
              canEdit={canEditNow}
              onAdd={()=>addRow("old")}
              onDelete={(id)=>deleteRow("old", id)}
              onName={(id,v)=>updateField("old", id, { name:v })}
              onValue={(id,v)=>updateField("old", id, { value:v })}
              onNote={(id,v)=>updateField("old", id, { note:v })}
              search={searchOld}
              setSearch={setSearchOld}
              onClickItem={openItemHistory}
            />
          </>
        )}

        {tab==="new" && (
          <>
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                <b>القائمة الجديدة</b>
                <button
                  onClick={()=>setPasteNewOpen(true)}
                  disabled={!canEditNow}
                  style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEditNow?1:0.5 }}
                >
                  📋 لصق قائمة
                </button>
              </div>

              {pasteNewOpen && (
                <div style={{ marginTop:10 }}>
                  <div style={{ color:"#666", fontSize:13 }}>الصقي القائمة هنا (كل سطر اسم + رقم).</div>
                  <textarea
                    value={pasteNewText}
                    onChange={(e)=>setPasteNewText(e.target.value)}
                    rows={8}
                    style={{ width:"100%", padding:10, border:"1px solid #ddd", borderRadius:10, marginTop:8 }}
                  />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                    <button
                      onClick={()=>{ importPaste("new", pasteNewText); setPasteNewOpen(false); setPasteNewText(""); }}
                      disabled={!canEditNow}
                      style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEditNow?1:0.5 }}
                    >
                      تحويل وإضافة
                    </button>
                    <button onClick={()=>setPasteNewOpen(false)} style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}>إلغاء</button>
                  </div>
                </div>
              )}
            </Card>

            <ItemsTable
              title="تعديل الجديدة"
              items={newItems}
              canEdit={canEditNow}
              onAdd={()=>addRow("new")}
              onDelete={(id)=>deleteRow("new", id)}
              onName={(id,v)=>updateField("new", id, { name:v })}
              onValue={(id,v)=>updateField("new", id, { value:v })}
              onNote={(id,v)=>updateField("new", id, { note:v })}
              search={searchNew}
              setSearch={setSearchNew}
              onClickItem={openItemHistory}
            />
          </>
        )}

        {tab==="log" && <EventsTab events={events} />}

        {tab==="versions" && (
          <Card>
            <h3 style={{ marginTop:0 }}>الإصدارات (Snapshots)</h3>
            <div style={{ color:"#666", fontSize:13 }}>احفظي نسخة قبل أي تعديل كبير، واسترجعيها وقت الحاجة.</div>

            <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
              <button
                onClick={() => {
                  const note = prompt("ملاحظة للنسخة (اختياري):") || "";
                  saveVersion(note);
                }}
                style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}
              >
                💾 حفظ نسخة
              </button>
            </div>

            <div style={{ marginTop:10 }}>
              {versions.length === 0 && <div style={{ color:"#666" }}>لا توجد نسخ.</div>}
              {versions.map((v) => (
                <div key={v.id} style={{ padding:"10px 0", borderBottom:"1px solid #f1f1f1" }}>
                  <div style={{ color:"#666", fontSize:13 }}>
                    <b>{v.saved_by}</b> — {new Date(v.created_at).toLocaleString()} {v.note ? `— 📝 ${v.note}` : ""}
                  </div>
                  <div style={{ marginTop:6, display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button
                      onClick={()=>restoreVersion(v)}
                      disabled={!canEditNow}
                      style={{ padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff", opacity: canEditNow?1:0.5 }}
                    >
                      ↩️ استرجاع هذه النسخة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* (15) Item History panel */}
        {selectedItem && (
          <Card>
            <h3 style={{ marginTop:0 }}>تاريخ البند</h3>
            <div style={{ color:"#666", fontSize:13 }}>
              <b>{selectedItem.name || "(بدون اسم)"}</b> — ID: <span style={{ fontFamily:"monospace" }}>{selectedItem.id}</span>
            </div>
            <button
              onClick={()=>{ setSelectedItem(null); setItemHistory([]); }}
              style={{ marginTop:10, padding:"8px 10px", border:"1px solid #ddd", borderRadius:10, background:"#fff" }}
            >
              إغلاق
            </button>

            <div style={{ marginTop:10 }}>
              {itemHistory.length === 0 && <div style={{ color:"#666" }}>لا يوجد تاريخ لهذا البند.</div>}
              {itemHistory.map((ev) => (
                <div key={ev.id} style={{ padding:"10px 0", borderBottom:"1px solid #f1f1f1" }}>
                  <div style={{ color:"#666", fontSize:13 }}>
                    <b>{(ev.who||"غير معروف").trim()||"غير معروف"}</b> — {new Date(ev.created_at).toLocaleString()}
                  </div>
                  <div style={{ marginTop:4 }}>
                    {ev.action} [{ev.list_name}] — {ev.item_name_before || ""} → {ev.item_name_after || ev.item_name_before || ""}
                    {" "} | {formatMoney(ev.value_before)} → {formatMoney(ev.value_after)}
                    {ev.note_after ? <> | 📝 {ev.note_after}</> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div style={{ marginTop:12, color:"#666", fontSize:13 }}>
        ✅ نصيحة: شاركي “رابط التعديل” لشخص واحد فقط، و”رابط المشاهدة” لأي شخص.
      </div>
    </div>
  );
}
