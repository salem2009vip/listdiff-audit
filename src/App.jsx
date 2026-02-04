import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

/* ================= Supabase ================= */
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
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[.*=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sumItems(items) {
  return (items || []).reduce((a, x) => a + (Number(x.value) || 0), 0);
}

function diffFinal(oldItems, newItems) {
  const o = new Map();
  const n = new Map();

  oldItems.forEach((x) => {
    const k = norm(x.name);
    if (k && !o.has(k)) o.set(k, x);
  });
  newItems.forEach((x) => {
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

  return { added, removed, changed, unchanged };
}

/* ================= UI ================= */
function Tab({ active, onClick, children }) {
  return (
    <button
      className={"tab" + (active ? " active" : "")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ItemsTable({ title, items, onAdd, onDelete, onName, onValue }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn" onClick={onAdd}>+ إضافة سطر</button>
      </div>

      <div className="tableWrap" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>الشيء</th>
              <th>القيمة (رقم)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((x) => (
              <tr key={x.id}>
                <td>
                  <input
                    className="input"
                    value={x.name || ""}
                    onChange={(e) => onName(x.id, e.target.value)}
                    placeholder="مثال: مطبخ خارجي"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    value={x.value ?? ""}
                    onChange={(e) =>
                      onValue(x.id, e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="مثال: 66891.9"
                  />
                </td>
                <td>
                  <button className="btn" onClick={() => onDelete(x.id)}>حذف</button>
                </td>
              </tr>
            ))}
            {(!items || items.length === 0) && (
              <tr><td colSpan={3} className="small">لا يوجد عناصر</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Events({ events }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>سجل التغييرات</h3>
      {(events || []).length === 0 && <div className="small">لا يوجد تغييرات.</div>}
      {(events || []).map((e) => (
        <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
          <div className="small">
            <b>{e.who}</b> — {new Date(e.created_at).toLocaleString()}
          </div>
          <div>
            [{e.list_name}] {e.action} — {e.item_name_after || e.item_name_before}
          </div>
        </div>
      ))}
    </div>
  );
}

function Final({ oldItems, newItems }) {
  const oldT = sumItems(oldItems);
  const newT = sumItems(newItems);
  const d = diffFinal(oldItems, newItems);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>النتيجة النهائية</h3>
      <div className="small">
        مجموع القديمة: <b>{oldT.toFixed(2)}</b> |
        مجموع الجديدة: <b>{newT.toFixed(2)}</b> |
        الفرق: <b>{(newT - oldT).toFixed(2)}</b>
      </div>

      <div style={{ marginTop: 10 }}>
        <b>➕ إضافات:</b>
        <ul>{d.added.map((x) => <li key={x.id}>{x.name} — {x.value}</li>)}</ul>

        <b>➖ محذوف:</b>
        <ul>{d.removed.map((x) => <li key={x.id}>{x.name} — {x.value}</li>)}</ul>

        <b>✏️ تغيّر:</b>
        <ul>
          {d.changed.map((x, i) => (
            <li key={i}>
              {x.name}: {x.oldValue} → {x.newValue} (Δ {x.diff})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ================= App ================= */
export default function App() {
  const roomId = getRoomId();
  const [tab, setTab] = useState("final");
  const [who, setWho] = useState(localStorage.getItem("who") || "");
  const [ready, setReady] = useState(!!who);

  const [oldItems, setOldItems] = useState([]);
  const [newItems, setNewItems] = useState([]);
  const [events, setEvents] = useState([]);

  const blockLog = useRef(false);

  /* ---------- Load ---------- */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();

      if (!data) {
        const seed = {
          id: roomId,
          old_items: [{ id: makeId(), name: "", value: "" }],
          new_items: [{ id: makeId(), name: "", value: "" }],
        };
        await supabase.from("rooms").insert(seed);
        setOldItems(seed.old_items);
        setNewItems(seed.new_items);
      } else {
        setOldItems(data.old_items || []);
        setNewItems(data.new_items || []);
      }

      const ev = await supabase
        .from("room_events")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(200);
      setEvents(ev.data || []);
    }
    load();
  }, [roomId]);

  /* ---------- Realtime ---------- */
  useEffect(() => {
    const ch1 = supabase
      .channel("rooms")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      }, (p) => {
        blockLog.current = true;
        setOldItems(p.new.old_items || []);
        setNewItems(p.new.new_items || []);
        setTimeout(() => (blockLog.current = false), 0);
      })
      .subscribe();

    const ch2 = supabase
      .channel("events")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "room_events",
        filter: `room_id=eq.${roomId}`,
      }, (p) => {
        setEvents((e) => [p.new, ...e]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [roomId]);

  /* ---------- Core ops ---------- */
  async function saveRoom(o, n) {
    await supabase.from("rooms").update({
      old_items: o,
      new_items: n,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId);
  }

  async function log(e) {
    if (blockLog.current) return;
    await supabase.from("room_events").insert({
      room_id: roomId,
      who,
      ...e,
    });
  }

  function add(list) {
    const it = { id: makeId(), name: "", value: "" };
    if (list === "old") {
      const n = [...oldItems, it];
      setOldItems(n);
      saveRoom(n, newItems);
    } else {
      const n = [...newItems, it];
      setNewItems(n);
      saveRoom(oldItems, n);
    }
    log({ action: "add", list_name: list, item_id: it.id });
  }

  function del(list, id) {
    const src = list === "old" ? oldItems : newItems;
    const it = src.find((x) => x.id === id);
    const n = src.filter((x) => x.id !== id);
    if (list === "old") {
      setOldItems(n);
      saveRoom(n, newItems);
    } else {
      setNewItems(n);
      saveRoom(oldItems, n);
    }
    log({
      action: "delete",
      list_name: list,
      item_id: id,
      item_name_before: it?.name,
      value_before: it?.value,
    });
  }

  function updName(list, id, v) {
    const src = list === "old" ? oldItems : newItems;
    const n = src.map((x) => x.id === id ? { ...x, name: v } : x);
    list === "old" ? setOldItems(n) : setNewItems(n);
    saveRoom(list === "old" ? n : oldItems, list === "new" ? n : newItems);
    log({ action: "update", list_name: list, item_id: id, item_name_after: v });
  }

  function updVal(list, id, v) {
    const src = list === "old" ? oldItems : newItems;
    const n = src.map((x) => x.id === id ? { ...x, value: v } : x);
    list === "old" ? setOldItems(n) : setNewItems(n);
    saveRoom(list === "old" ? n : oldItems, list === "new" ? n : newItems);
    log({ action: "update", list_name: list, item_id: id, value_after: v });
  }

  if (!ready) {
    return (
      <div className="container">
        <div className="card">
          <h2>ادخلي اسمك</h2>
          <input className="input" value={who} onChange={(e) => setWho(e.target.value)} />
          <button
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => { localStorage.setItem("who", who); setReady(true); }}
            disabled={!who}
          >
            دخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>مقارنة القوائم</h2>
        <div className="tabs">
          <Tab active={tab === "final"} onClick={() => setTab("final")}>النتيجة</Tab>
          <Tab active={tab === "old"} onClick={() => setTab("old")}>القديمة</Tab>
          <Tab active={tab === "new"} onClick={() => setTab("new")}>الجديدة</Tab>
          <Tab active={tab === "log"} onClick={() => setTab("log")}>السجل</Tab>
        </div>
      </div>

      {tab === "final" && <Final oldItems={oldItems} newItems={newItems} />}
      {tab === "old" && (
        <ItemsTable
          title="القائمة القديمة"
          items={oldItems}
          onAdd={() => add("old")}
          onDelete={(id) => del("old", id)}
          onName={(id, v) => updName("old", id, v)}
          onValue={(id, v) => updVal("old", id, v)}
        />
      )}
      {tab === "new" && (
        <ItemsTable
          title="القائمة الجديدة"
          items={newItems}
          onAdd={() => add("new")}
          onDelete={(id) => del("new", id)}
          onName={(id, v) => updName("new", id, v)}
          onValue={(id, v) => updVal("new", id, v)}
        />
      )}
      {tab === "log" && <Events events={events} />}
    </div>
  );
}
