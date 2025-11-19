import { useState } from "react";
import axios from "axios";

export default function Register({ onRegister, onSwitch }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:5000/api/auth/register", {
        username,
        email,
        password,
      });

      // Save token and user in localStorage
      localStorage.setItem("token", res.data.token);
      localStorage.setItem(
        "user",
        JSON.stringify({ _id: res.data._id, username: res.data.username, email: res.data.email })
      );

      onRegister({ _id: res.data._id, username: res.data.username, email: res.data.email });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 border border-gray-700">
      <h2 className="text-2xl font-semibold text-center mb-6 text-white">🚀 Create an Account</h2>

      {error && (
        <p className="bg-red-500/10 text-red-400 border border-red-400/30 p-2 rounded-md mb-4 text-sm text-center">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-gray-300 text-sm mb-1">Username</label>
          <input
            type="text"
            placeholder="Your name"
            className="w-full p-3 rounded-lg bg-gray-700 text-gray-100 border border-gray-600"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm mb-1">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full p-3 rounded-lg bg-gray-700 text-gray-100 border border-gray-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm mb-1">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full p-3 rounded-lg bg-gray-700 text-gray-100 border border-gray-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 p-3 rounded-lg font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Registering..." : "Register"}
        </button>
      </form>

      <p className="text-gray-400 text-sm text-center mt-6">
        Already have an account?{" "}
        <button
          type="button"
          className="text-blue-400 hover:underline"
          onClick={onSwitch}
        >
          Login
        </button>
      </p>
    </div>
  );
}
