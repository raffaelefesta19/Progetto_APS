import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
    const nav = useNavigate();
    const { login } = useAuth();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        requestAnimationFrame(() => el.removeAttribute("data-state"));
    }, []);

    const go = async () => {
        setErr(null);
        setLoading(true);
        try {
            const u = await login(username.trim(), password);
            if (u.role === "PAT") nav("/patient");
            else if (u.role === "LAB") nav("/lab");
            else nav("/hospital");
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Login fallita");
        } finally {
            setLoading(false);
        }
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") void go();
    };

    return (
        <div ref={cardRef} className="glass-card card-anim" data-state="enter">
            <h1 className="card-title">Login</h1>

            <div className="field">
                <label className="label">Username</label>
                <input
                    className="input"
                    placeholder="es. pat1"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={onKey}
                />
            </div>

            <div className="field">
                <label className="label">Password</label>
                <input
                    className="input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKey}
                />
            </div>

            {err && <div className="text-red-300 text-sm mb-2">{err}</div>}

            <button className="btn-primary" onClick={go} disabled={loading}>
                {loading ? "Accesso..." : "Login"}
            </button>

            <div className="text-center mt-4 text-white/80 text-sm">
                Non hai un account? <Link to="/register" className="link">Register</Link>
            </div>

            <div className="mt-4 text-xs text-white/70">
                <div>Demo credenziali</div>
                <div>• Paziente: <code>pat1 / pat1pass</code></div>
                <div>• Laboratorio: <code>lab1 / lab1pass</code></div>
                <div>• Ospedale: <code>hosp1 / hosp1pass</code></div>
            </div>
        </div>
    );
}
