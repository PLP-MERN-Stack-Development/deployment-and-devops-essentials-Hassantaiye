import { useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";

export default function App() {
  const [page, setPage] = useState("login");
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
    setPage("chat");
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setPage("chat");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setPage("login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      {page === "login" && <Login onLogin={handleLogin} onSwitch={() => setPage("register")} />}
      {page === "register" && (
        <Register onRegister={handleRegister} onSwitch={() => setPage("login")} />
      )}
      {page === "chat" && user && <Chat user={user} onLogout={handleLogout} />}
    </div>
  );
}
