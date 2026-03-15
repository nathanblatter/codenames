import { useState } from "react";
import Button from "./Button";

export default function Auth({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 p-4">
      <h2 className="text-2xl font-bold text-gray-800">Login</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <Button className="justify-center bg-indigo-600">Log In</Button>
      </form>
    </div>
  );
}
