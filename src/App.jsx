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

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

// إزالة التشكيل + التطويل فقط (بدون حذف أرقام)
function stripArabic(s) {
  return (s || "")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\u0640/g, "");
}

// تطبيع ذكي: يوحد حروف عربية + يحذف رموز/مسافات فقط
// ✅ لا يحذف الأرقام إطلاقًا
function norm(s) {
  let x = stripArabic(s || "").toLowerCase();

  // توحيد حروف
  x = x
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");

  // حذف الرموز فقط (بدون أرقام)
  x = x
    .replace(/[.*=،,:;()\-_/\\]/g, " ")
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

// لصق قائمة -> عناصر (الشيء + القيمة + ملاحظة)
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

// مقارنة نهائية (تطابق ذكي مع الأرقام)
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

  for (const [k, nv] of n.entries()) {
    if (!o.has(k)) added.push(nv);
  }

  const byName = (a, b) => norm(a.name).localeCompare(norm(b.name));
  added.sort(byName);
  removed.sort(byName);
  unchanged.sort(byName);
  changed.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  return { added, removed, changed, unchanged };
}

/* ================= UI ================= */
function Card({ children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e6e6e6", borderRadius: 14, padding: 12 }}>
      {children}
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: active ? "1px solid #0b57d0" : "1px solid #ddd",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ItemsTable({
  title,
  items,
  locked,
  onAdd,
  onDelete,
  onName,
  onValue,
  onNote,
  search,
  setSearch,
}) {
  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return items || [];
    return (items || []).filter((x) => norm(x.name).includes(q) || String(x.value ?? "").includes(search));
  }, [items, search]);

  const disabled = locked;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم…"
            style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10, minWidth: 220 }}
          />
          <button
            onClick={onAdd}
            disabled={disabled}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "#fff",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            + إضافة سطر
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #f1f1f1" }}>الشيء</th>
              <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #f1f1f1" }}>القيمة</th>
              <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #f1f1f1" }}>ملاحظة</th>
              <th style={{ padding: 8, borderBottom: "1px solid #f1f1f1" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id}>
                <td style={{ padding: 8, borderBottom: "1px solid #f7f7f7" }}>
                  <input
                    value={x.name || ""}
                    onChange={(e) => onName(x.id, e.target.value)}
                    placeholder="مثال: مظلة 6 متر"
                    disabled={disabled}
                    style={{ width: "100%", padding: 9, borderRadius: 10, border: "1px solid #ddd", opacity: disabled ? 0.7 : 1 }}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #f7f7f7" }}>
                  <input
                    type="number"
                    value={x.value ?? ""}
                    onChange={(e) => onValue(x.id, e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    disabled={disabled}
                    style={{ width: "100%", padding: 9, borderRadius: 10, border: "1px solid #ddd", opacity: disabled ? 0.7 : 1 }}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #f7f7f7" }}>
                  <input
                    value={x.note || ""}
                    onChange={(e) => onNote(x.id, e.target.value)}
                    placeholder="مثال: دفعة / تم الاستلام"
                    disabled={disabled}
                    style={{ width: "100%", padding: 9, borderRadius: 10, border: "1px solid #ddd", opacity: disabled ? 0.7 : 1 }}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #f7f7f7", textAlign: "center" }}>
                  <button
                    onClick={() => onDelete(x.id)}
                    disabled={disabled}
                    style={{
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      background: "#fff",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 8, color: "#666" }}>
                  ما في نتائج.
                </td>
              </tr>
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
    const s = new Set((events || []).map((e) => (e.who || "غير معروف").trim() || "غير معروف"));
    return ["all", ...Array.from(s)];
  }, [events]);

  const filtered = useMemo(() => {
    const qq = norm(q);
    return (events || []).filter((e) => {
      if (listFilter !== "all" && e.list_name !== listFilter) return false;
      if (typeFilter !== "all" && e.action !== typeFilter) return false;
      const who = (e.who || "غير معروف").trim() || "غير معروف";
      if (whoFilter !== "all" && who !== whoFilter) return false;

      if (!qq) return true;
      const txt = norm(`${e.item_name_before || ""} ${e.item_name_after || ""} ${who} ${e.list_name || ""} ${e.action || ""}`);
      return txt.includes(qq);
    });
  }, [events, q, listFilter, typeFilter, whoFilter]);

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>سجل التغييرات</h3>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10, minWidth: 220 }} />
        <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10 }}>
          <option value="all">كل القوائم</option>
          <option value="old">القديمة</option>
          <option value="new">الجديدة</option>
          <option value="system">النظام</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10 }}>
          <option value="all">كل الأنواع</option>
          <option value="add">إضافة</option>
          <option value="delete">حذف</option>
          <option value="update">تعديل</option>
        </select>
        <select value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10 }}>
          {whoOptions.map((w) => (
            <option key={w} value={w}>
              {w === "all" ? "كل الأشخاص" : w}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        {filtered.length === 0 && <div style={{ color: "#666" }}>لا يوجد نتائج.</div>}

        {filtered.map((ev) => {
          const who = (ev.who || "غير معروف").trim() || "غير معروف";
          const when = new Date(ev.created_at).toLocaleString();
          return (
            <div key={ev.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f1f1" }}>
              <div style={{ color: "#666", fontSize: 13 }}>
                <b>{who}</b> — {when}
              </div>
              <div style={{ marginTop: 4 }}>
                <b>[{ev.list_name}]</b>{" "}
                {ev.action === "add" && <>➕ أضاف: <b>{ev.item_name_after || ""}</b></>}
                {ev.action === "delete" && <>🗑️ حذف: <b>{ev.item_name_before || ""}</b></>}
                {ev.action === "update" && (
                  <>✏️ عدّل: <b>{ev.item_name_before || ""}</b> → <b>{ev.item_name_after || ev.item_name_before || ""}</b></>
                )}
                {" "} | {formatMoney(ev.value_before)} → {formatMoney(ev.value_after)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FinalTab({ oldItems, newItems }) {
  const oldT = sumItems(oldItems);
  const newT = sumItems(newItems);
  const d = diffFinal(oldItems, newItems);

  const boxStyle = (kind) => {
    if (kind === "add") return { background: "#ecfdf3", border: "1px solid #b7f0c8" }; // أخضر
    if (kind === "del") return { background: "#fff1f1", border: "1px solid #ffcccc" }; // أحمر
    if (kind === "chg") return { background: "#fff7ed", border: "1px solid #ffd7aa" }; // برتقالي
    return { background: "#f7f7f7", border: "1px solid #e6e6e6" };
  };

  return (
    <>
      <Card>
        <h3 style={{ marginTop: 0 }}>النتيجة النهائية</h3>
        <div style={{ color: "#666", fontSize: 13 }}>
          مجموع القديمة: <b>{formatMoney(oldT)}</b> | مجموع الجديدة: <b>{formatMoney(newT)}</b> | الفرق: <b>{formatMoney(newT - oldT)}</b>
        </div>
      </Card>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <Card>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 12, ...boxStyle("add") }}>
              <b>➕ إضافات ({d.added.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.added.map((x) => (
                  <li key={x.id}>
                    {x.name} — {formatMoney(x.value)}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ padding: 10, borderRadius: 12, ...boxStyle("del") }}>
              <b>➖ محذوف ({d.removed.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.removed.map((x) => (
                  <li key={x.id}>
                    {x.name} — {formatMoney(x.value)}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ padding: 10, borderRadius: 12, ...boxStyle("chg") }}>
              <b>✏️ تغيّر ({d.changed.length})</b>
              <ul style={{ margin: "8px 0 0 0" }}>
                {d.changed.map((x, i) => (
                  <li key={i}>
                    {x.name}: {formatMoney(x.oldValue)} → {formatMoney(x.newValue)} (Δ {formatMoney(x.diff)})
                  </li>
                ))}
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

  const [pinInput, setPinInput] = useState("");

  // يمنع تسجيل مزدوج عند تحديث realtime
  const blockLog = useRef(false);

  const locked = !!room?.is_locked;

  /* ---------- Load room + events + versions ---------- */
  useEffect(() => {
    let alive = true;

    async function load() {
      setStatus("loading room...");

      const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (!alive) return;

      if (error) {
        setStatus("error: " + error.message);
        return;
      }

      if (!data) {
        const seed = {
          id: roomId,
          old_items: [{ id: makeId(), name: "", value: "", note: "" }],
          new_items: [{ id: makeId(), name: "", value: "", note: "" }],
          is_locked: false,
          lock_pin: null,
        };
        const ins = await supabase.from("rooms").insert(seed);
        if (ins.error) {
          setStatus("error: " + ins.error.message);
          return;
        }
        setRoom(seed);
        setOldItems(seed.old_items);
        setNewItems(seed.new_items);
        setStatus("room created ✅");
      } else {
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
    return () => {
      alive = false;
    };
  }, [roomId]);

  /* ---------- Realtime subscriptions ---------- */
  useEffect(() => {
    const chRooms = supabase
      .channel("rooms-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (p) => {
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` }, (p) => {
        if (!p.new) return;
        setEvents((prev) => [p.new, ...prev].slice(0, 300));
      })
      .subscribe();

    const chVers = supabase
      .channel("versions-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_versions", filter: `room_id=eq.${roomId}` }, (p) => {
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
      ...(patchRoom || {}),
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

  /* ---------- Lock / Unlock ---------- */
  async function lockRoom() {
    if (!pinInput.trim()) {
      alert("حطي PIN للقفل (مثلاً 1234)");
      return;
    }
    await saveRoom(oldItems, newItems, { is_locked: true, lock_pin: pinInput.trim() });
    await logEvent({ action: "update", list_name: "system", item_id: makeId(), item_name_before: "lock", item_name_after: "locked" });
    setPinInput("");
  }

  async function unlockRoom() {
    if (!room) return;
    if ((pinInput.trim() || "") !== (room.lock_pin || "")) {
      alert("PIN غير صحيح");
      return;
    }
    await saveRoom(oldItems, newItems, { is_locked: false });
    await logEvent({ action: "update", list_name: "system", item_id: makeId(), item_name_before: "lock", item_name_after: "unlocked" });
    setPinInput("");
  }

  /* ---------- Operations ---------- */
  async function addRow(listName) {
    if (locked) return;
    const it = { id: makeId(), name: "", value: "", note: "" };
    if (listName === "old") {
      const next = [...oldItems, it];
      setOldItems(next);
      await saveRoom(next, newItems);
    } else {
      const next = [...newItems, it];
      setNewItems(next);
      await saveRoom(oldItems, next);
    }
    await logEvent({ action: "add", list_name: listName, item_id: it.id, item_name_after: "", value_after: null });
  }

  async function deleteRow(listName, itemId) {
    if (locked) return;
    const src = listName === "old" ? oldItems : newItems;
    const before = src.find((x) => x.id === itemId);
    const next = src.filter((x) => x.id !== itemId);

    if (listName === "old") {
      setOldItems(next);
      await saveRoom(next, newItems);
    } else {
      setNewItems(next);
      await saveRoom(oldItems, next);
    }

    await logEvent({
      action: "delete",
      list_name: listName,
      item_id: itemId,
      item_name_before: before?.name || "",
      value_before: before?.value === "" ? null : Number(before?.value),
    });
  }

  async function updateField(listName, itemId, patch) {
    if (locked) return;
    const src = listName === "old" ? oldItems : newItems;
    const idx = src.findIndex((x) => x.id === itemId);
    if (idx === -1) return;

    const before = src[idx];
    const after = { ...before, ...patch };
    const next = src.slice();
    next[idx] = after;

    if (listName === "old") {
      setOldItems(next);
      await saveRoom(next, newItems);
    } else {
      setNewItems(next);
      await saveRoom(oldItems, next);
    }

    await logEvent({
      action: "update",
      list_name: listName,
      item_id: itemId,
      item_name_before: before.name || "",
      item_name_after: after.name || before.name || "",
      value_before: before.value === "" ? null : Number(before.value),
      value_after: after.value === "" ? null : Number(after.value),
    });
  }

  async function importPaste(listName, pastedText) {
    if (locked) return;
    const parsed = parsePastedList(pastedText);
    if (parsed.length === 0) return;

    if (listName === "old") {
      const merged = [...oldItems.filter((x) => x.name || x.value !== "" || x.note), ...parsed];
      setOldItems(merged);
      await saveRoom(merged, newItems);
    } else {
      const merged = [...newItems.filter((x) => x.name || x.value !== "" || x.note), ...parsed];
      setNewItems(merged);
      await saveRoom(oldItems, merged);
    }

    await logEvent({
      action: "add",
      list_name: listName,
      item_id: makeId(),
      item_name_after: `لصق قائمة (${parsed.length} بند)`,
      value_after: parsed.reduce((a, x) => a + (Number(x.value) || 0), 0),
    });
  }

  /* ---------- Versions (Snapshots) ---------- */
  async function saveVersion(note) {
    const savedBy = (localStorage.getItem("listdiff_who") || who || "Unknown").trim() || "Unknown";
    const { error } = await supabase.from("room_versions").insert({
      room_id: roomId,
      saved_by: savedBy,
      note: note || null,
      old_items: oldItems,
      new_items: newItems,
    });
    if (error) alert("خطأ حفظ نسخة: " + error.message);
    else alert("✅ تم حفظ نسخة");
  }

  async function restoreVersion(v) {
    if (locked) {
      alert("الغرفة مقفولة. افتحي القفل أولاً.");
      return;
    }
    if (!v) return;

    blockLog.current = true;
    setOldItems(v.old_items || []);
    setNewItems(v.new_items || []);
    await saveRoom(v.old_items || [], v.new_items || []);
    setTimeout(() => (blockLog.current = false), 0);

    await logEvent({
      action: "update",
      list_name: "system",
      item_id: makeId(),
      item_name_before: "version",
      item_name_after: `restore ${v.id}`,
    });

    alert("✅ تم استرجاع النسخة");
  }

  /* ---------- Name gate ---------- */
  if (!ready) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 14 }}>
        <Card>
          <h2 style={{ marginTop: 0 }}>ادخلي اسمك</h2>
          <div style={{ color: "#666", fontSize: 13 }}>الاسم ضروري للسجل.</div>

          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="مثال: فاطمة"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10, marginTop: 10 }}
          />

          <button
            onClick={() => {
              const w = who.trim();
              if (!w) return;
              localStorage.setItem("listdiff_who", w);
              setReady(true);
            }}
            disabled={!who.trim()}
            style={{
              marginTop: 10,
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "#fff",
              opacity: who.trim() ? 1 : 0.5,
            }}
          >
            دخول
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 14, background: "#fafafa", minHeight: "100vh" }}>
      <Card>
        <h2 style={{ margin: "0 0 6px 0" }}>مقارنة القوائم (مباشر + سجل + إصدارات)</h2>
        <div style={{ color: "#666", fontSize: 13 }}>
          Room: <b>{roomId}</b> — أنت: <b>{localStorage.getItem("listdiff_who")}</b> — الحالة: {status}{" "}
          {locked ? (
            <>
              — 🔒 <b>مقفول</b>
            </>
          ) : (
            <>
              — 🔓 <b>مفتوح</b>
            </>
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tab active={tab === "final"} onClick={() => setTab("final")}>النتيجة</Tab>
          <Tab active={tab === "old"} onClick={() => setTab("old")}>القديمة</Tab>
          <Tab active={tab === "new"} onClick={() => setTab("new")}>الجديدة</Tab>
          <Tab active={tab === "log"} onClick={() => setTab("log")}>السجل</Tab>
          <Tab active={tab === "versions"} onClick={() => setTab("versions")}>الإصدارات</Tab>
        </div>

        {/* Lock controls */}
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN (مثال 1234)"
            style={{ padding: 9, border: "1px solid #ddd", borderRadius: 10, minWidth: 180 }}
          />
          {!locked ? (
            <button onClick={lockRoom} style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
              🔒 قفل القوائم
            </button>
          ) : (
            <button onClick={unlockRoom} style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
              🔓 فتح القوائم
            </button>
          )}
        </div>
      </Card>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {tab === "final" && <FinalTab oldItems={oldItems} newItems={newItems} />}

        {tab === "old" && (
          <>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <b>القائمة القديمة</b>
                <button
                  onClick={() => setPasteOldOpen(true)}
                  disabled={locked}
                  style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", opacity: locked ? 0.5 : 1 }}
                >
                  📋 لصق قائمة
                </button>
              </div>

              {pasteOldOpen && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "#666", fontSize: 13 }}>الصقي القائمة هنا (كل سطر فيه اسم + رقم).</div>
                  <textarea
                    value={pasteOldText}
                    onChange={(e) => setPasteOldText(e.target.value)}
                    rows={8}
                    style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button
                      onClick={() => {
                        importPaste("old", pasteOldText);
                        setPasteOldOpen(false);
                        setPasteOldText("");
                      }}
                      disabled={locked}
                      style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", opacity: locked ? 0.5 : 1 }}
                    >
                      تحويل وإضافة
                    </button>
                    <button onClick={() => setPasteOldOpen(false)} style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <ItemsTable
              title="تعديل القديمة"
              items={oldItems}
              locked={locked}
              onAdd={() => addRow("old")}
              onDelete={(id) => deleteRow("old", id)}
              onName={(id, v) => updateField("old", id, { name: v })}
              onValue={(id, v) => updateField("old", id, { value: v })}
              onNote={(id, v) => updateField("old", id, { note: v })}
              search={searchOld}
              setSearch={setSearchOld}
            />
          </>
        )}

        {tab === "new" && (
          <>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <b>القائمة الجديدة</b>
                <button
                  onClick={() => setPasteNewOpen(true)}
                  disabled={locked}
                  style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", opacity: locked ? 0.5 : 1 }}
                >
                  📋 لصق قائمة
                </button>
              </div>

              {pasteNewOpen && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "#666", fontSize: 13 }}>الصقي القائمة هنا (كل سطر فيه اسم + رقم).</div>
                  <textarea
                    value={pasteNewText}
                    onChange={(e) => setPasteNewText(e.target.value)}
                    rows={8}
                    style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button
                      onClick={() => {
                        importPaste("new", pasteNewText);
                        setPasteNewOpen(false);
                        setPasteNewText("");
                      }}
                      disabled={locked}
                      style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", opacity: locked ? 0.5 : 1 }}
                    >
                      تحويل وإضافة
                    </button>
                    <button onClick={() => setPasteNewOpen(false)} style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <ItemsTable
              title="تعديل الجديدة"
              items={newItems}
              locked={locked}
              onAdd={() => addRow("new")}
              onDelete={(id) => deleteRow("new", id)}
              onName={(id, v) => updateField("new", id, { name: v })}
              onValue={(id, v) => updateField("new", id, { value: v })}
              onNote={(id, v) => updateField("new", id, { note: v })}
              search={searchNew}
              setSearch={setSearchNew}
            />
          </>
        )}

        {tab === "log" && <EventsTab events={events} />}

        {tab === "versions" && (
          <Card>
            <h3 style={{ marginTop: 0 }}>الإصدارات (Snapshots)</h3>
            <div style={{ color: "#666", fontSize: 13 }}>احفظي نسخة قبل أي تعديل كبير، واسترجعيها وقت الحاجة.</div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const note = prompt("ملاحظة للنسخة (اختياري):") || "";
                  saveVersion(note);
                }}
                style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}
              >
                💾 حفظ نسخة
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              {versions.length === 0 && <div style={{ color: "#666" }}>لا توجد نسخ.</div>}

              {versions.map((v) => (
                <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f1f1" }}>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    <b>{v.saved_by}</b> — {new Date(v.created_at).toLocaleString()} {v.note ? `— 📝 ${v.note}` : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => restoreVersion(v)}
                      disabled={locked}
                      style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", opacity: locked ? 0.5 : 1 }}
                    >
                      ↩️ استرجاع هذه النسخة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
        ✅ الآن: رابط واحد فقط. أي شخص يفتح الرابط يقدر يعدّل إذا الغرفة غير مقفولة.
      </div>
    </div>
  );
}
