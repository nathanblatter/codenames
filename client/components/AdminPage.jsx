import { useState, useEffect, useRef } from "react";
import { Trash2, Shield, ShieldOff, Edit2, X, Plus } from "react-feather";

function authHeaders(user) {
  return { "Content-Type": "application/json", "x-user-id": String(user.id) };
}

// ── Shared Modal ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div ref={ref} className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ── Users Tab ────────────────────────────────────────────────────────────────

function UserFormModal({ user, editing, onClose, onSave }) {
  const [username, setUsername] = useState(editing?.username || "");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(editing?.is_admin || false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = editing
        ? { username, isAdmin, ...(password ? { password } : {}) }
        : { username, password, isAdmin };
      const url = editing ? `/admin/users/${editing.id}` : "/admin/users";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(user), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onSave(data, !!editing);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Edit User" : "Create User"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Username">
          <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)} required />
        </Field>
        <Field label={editing ? "New Password (leave blank to keep)" : "Password"}>
          <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)} required={!editing} />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => setIsAdmin(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${isAdmin ? "bg-indigo-600" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isAdmin ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span className="text-sm text-gray-700">Admin</span>
        </label>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Saving..." : editing ? "Save Changes" : "Create User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UsersTab({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', user? }

  async function load() {
    setLoading(true);
    const res = await fetch("/admin/users", { headers: authHeaders(user) });
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleSave(saved, isEdit) {
    if (isEdit) setUsers(prev => prev.map(u => u.id === saved.id ? saved : u));
    else setUsers(prev => [saved, ...prev]);
  }

  async function toggleAdmin(u) {
    const res = await fetch(`/admin/users/${u.id}/toggle-admin`, { method: "PATCH", headers: authHeaders(user) });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(x => x.id === updated.id ? { ...x, is_admin: updated.is_admin } : x));
    }
  }

  async function deleteUser(u) {
    if (!confirm(`Delete "${u.username}"? This cannot be undone.`)) return;
    const res = await fetch(`/admin/users/${u.id}`, { method: "DELETE", headers: authHeaders(user) });
    if (res.ok) setUsers(prev => prev.filter(x => x.id !== u.id));
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ mode: "create" })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> New User
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">Username</th>
              <th className="pb-2 font-medium">Joined</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 font-medium text-gray-800">
                  {u.username}
                  {u.id === user.id && <span className="ml-2 text-xs text-indigo-500">(you)</span>}
                </td>
                <td className="py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_admin ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.is_admin ? "Admin" : "Player"}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setModal({ mode: "edit", editUser: u })} title="Edit" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => toggleAdmin(u)} title={u.is_admin ? "Remove admin" : "Make admin"} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-indigo-600 transition-colors">
                      {u.is_admin ? <ShieldOff size={14} /> : <Shield size={14} />}
                    </button>
                    {u.id !== user.id && (
                      <button onClick={() => deleteUser(u)} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserFormModal
          user={user}
          editing={modal.mode === "edit" ? modal.editUser : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Game History Tab ──────────────────────────────────────────────────────────

const TYPE_COLOR = {
  blue: "bg-blue-600 text-white",
  red: "bg-red-600 text-white",
  assassin: "bg-gray-900 text-white",
  neutral: "bg-gray-200 text-gray-700",
};
const TYPE_CYCLE = { blue: "red", red: "neutral", neutral: "assassin", assassin: "blue" };

function GameEditModal({ user, game, onClose, onSave }) {
  const [words, setWords] = useState(Array.isArray(game.words) ? [...game.words] : JSON.parse(game.words));
  const [types, setTypes] = useState(Array.isArray(game.types) ? [...game.types] : JSON.parse(game.types));
  const [winner, setWinner] = useState(game.winner || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function cycleType(i) {
    setTypes(prev => { const next = [...prev]; next[i] = TYPE_CYCLE[next[i]] || "blue"; return next; });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/admin/games/${game.id}`, {
        method: "PUT",
        headers: authHeaders(user),
        body: JSON.stringify({ words, types, winner: winner || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onSave(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Game" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Field label="Winner">
          <div className="flex gap-2">
            {["", "blue", "red"].map(v => (
              <button
                key={v}
                onClick={() => setWinner(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  winner === v
                    ? v === "blue" ? "bg-blue-600 text-white border-blue-600"
                      : v === "red" ? "bg-red-600 text-white border-red-600"
                      : "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {v === "" ? "None" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Board - click a card to cycle its type, edit text to change the word">
          <div className="grid grid-cols-5 gap-1.5 mt-1">
            {words.map((word, i) => (
              <div key={i} className="flex flex-col gap-1">
                <button
                  onClick={() => cycleType(i)}
                  className={`rounded px-1 py-2 text-center text-xs font-bold uppercase cursor-pointer transition-colors ${TYPE_COLOR[types[i]]}`}
                  title="Click to cycle type"
                >
                  {types[i]}
                </button>
                <input
                  className="text-xs border border-gray-300 rounded px-1 py-1 text-center uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={word}
                  onChange={e => setWords(prev => { const next = [...prev]; next[i] = e.target.value.toUpperCase(); return next; })}
                />
              </div>
            ))}
          </div>
        </Field>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GameRow({ user, game, onDelete, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const words = Array.isArray(game.words) ? game.words : JSON.parse(game.words);
  const types = Array.isArray(game.types) ? game.types : JSON.parse(game.types);

  async function handleDelete() {
    if (!confirm("Delete this game record?")) return;
    const res = await fetch(`/admin/games/${game.id}`, { method: "DELETE", headers: authHeaders(user) });
    if (res.ok) onDelete(game.id);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 hover:bg-gray-50">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-3 flex-1 text-left">
          {game.winner ? (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${game.winner === "blue" ? "bg-blue-600 text-white" : "bg-red-600 text-white"}`}>
              {game.winner} wins
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">No result</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${game.adult_mode ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
            {game.adult_mode ? "Adult" : "Clean"}
          </span>
          <span className="text-gray-400 text-xs ml-auto mr-3">{new Date(game.ended_at).toLocaleString()}</span>
        </button>
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors" title="Edit">
            <Edit2 size={14} />
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 pt-0 border-t border-gray-100">
          <div className="grid grid-cols-5 gap-1.5">
            {words.map((word, i) => (
              <div key={i} className={`rounded px-1 py-2 text-center text-xs font-bold uppercase ${TYPE_COLOR[types[i]] || TYPE_COLOR.neutral}`}>
                {word}
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <GameEditModal
          user={user}
          game={game}
          onClose={() => setEditing(false)}
          onSave={updated => onUpdate(updated)}
        />
      )}
    </div>
  );
}

function GamesTab({ user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/admin/games", { headers: authHeaders(user) });
      if (res.ok) setGames(await res.json());
      setLoading(false);
    })();
  }, []);

  function handleDelete(id) { setGames(prev => prev.filter(g => g.id !== id)); }
  function handleUpdate(updated) { setGames(prev => prev.map(g => g.id === updated.id ? updated : g)); }

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (!games.length) return <p className="text-gray-500 text-sm">No completed games yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      {games.map(g => (
        <GameRow key={g.id} user={user} game={g} onDelete={handleDelete} onUpdate={handleUpdate} />
      ))}
    </div>
  );
}

// ── Themes Tab ────────────────────────────────────────────────────────────────

function ThemeFormModal({ user, editing, onClose, onSave }) {
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const url = editing ? `/admin/themes/${editing.id}` : "/admin/themes";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(user), body: JSON.stringify({ name, description }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onSave(data, !!editing);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Edit Theme" : "Create Theme"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Theme Name">
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ocean, Space, Movies" required />
        </Field>
        <Field label="Description (injected into AI prompt)">
          <textarea
            className={inputCls + " resize-y min-h-[80px]"}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Words related to the ocean, sea life, sailing, and underwater exploration."
            required
          />
        </Field>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Saving..." : editing ? "Save Changes" : "Create Theme"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ThemesTab({ user }) {
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/admin/themes", { headers: authHeaders(user) });
    if (res.ok) setThemes(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleSave(saved, isEdit) {
    if (isEdit) setThemes(prev => prev.map(t => t.id === saved.id ? saved : t));
    else setThemes(prev => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function deleteTheme(t) {
    if (!confirm(`Delete theme "${t.name}"?`)) return;
    const res = await fetch(`/admin/themes/${t.id}`, { method: "DELETE", headers: authHeaders(user) });
    if (res.ok) setThemes(prev => prev.filter(x => x.id !== t.id));
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ mode: "create" })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> New Theme
        </button>
      </div>

      {!themes.length && <p className="text-gray-500 text-sm text-center py-6">No themes yet. Create one to guide AI word selection.</p>}

      <div className="flex flex-col gap-3">
        {themes.map(t => (
          <div key={t.id} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800">{t.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setModal({ mode: "edit", theme: t })} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors" title="Edit">
                <Edit2 size={14} />
              </button>
              <button onClick={() => deleteTheme(t)} className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <ThemeFormModal
          user={user}
          editing={modal.mode === "edit" ? modal.theme : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Admin Page ────────────────────────────────────────────────────────────────

export default function AdminPage({ user, onBack }) {
  const [tab, setTab] = useState("users");

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            &larr; Back to game
          </button>
          <h1 className="text-lg font-bold text-gray-800">Admin</h1>
        </div>
        <span className="text-sm text-gray-500">{user.username}</span>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex gap-1 mb-6 bg-gray-200 rounded-lg p-1 w-fit">
          {["users", "games", "themes"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t === "games" ? "Game History" : t === "themes" ? "Themes" : "Users"}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {tab === "users" && <UsersTab user={user} />}
          {tab === "games" && <GamesTab user={user} />}
          {tab === "themes" && <ThemesTab user={user} />}
        </div>
      </div>
    </div>
  );
}
