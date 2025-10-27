import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../auth/utils";

export default function Register() {
    const nav = useNavigate();
    const { register } = useAuth();

    const [role, setRole] = useState<Role>("PAT");
    const [username, setUsername] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        requestAnimationFrame(() => el.removeAttribute("data-state"));
    }, []);

    const submit = async () => {
        setErr(null);

        const u = username.trim();
        const p = password;
        if (u.length < 3) { setErr("Lo username deve avere almeno 3 caratteri."); return; }
        if (p.length < 4) { setErr("La password deve avere almeno 4 caratteri."); return; }

        setLoading(true);
        try {
            const user = await register(role, u, name.trim(), email.trim(), p);
            if (user.role === "PAT") nav("/patient");
            else if (user.role === "LAB") nav("/lab");
            else nav("/hospital"); // HOSP e DOC usano la stessa console di consultazione
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Registrazione fallita");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div ref={cardRef} className="glass-card card-anim" data-state="enter">
            <h1 className="card-title">Register</h1>

            <div className="segmented">
                <button className={`seg-btn ${role === "PAT" ? "seg-btn--active" : ""}`} onClick={() => setRole("PAT")}>Paziente</button>
                <button className={`seg-btn ${role === "HOSP" ? "seg-btn--active" : ""}`} onClick={() => setRole("HOSP")}>Ospedale</button>
                <button className={`seg-btn ${role === "DOC" ? "seg-btn--active" : ""}`} onClick={() => setRole("DOC")}>Medico</button>
                <button className={`seg-btn ${role === "LAB" ? "seg-btn--active" : ""}`} onClick={() => setRole("LAB")}>Laboratorio</button>
            </div>

            <div className="field">
                <label className="label">Username</label>
                <input className="input" placeholder="es. mariorossi" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>

            <div className="field">
                <label className="label">Nome</label>
                <input className="input" placeholder="Mario Rossi" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field">
                <label className="label">Email</label>
                <input className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="field">
                <label className="label">Password</label>
                <input className="input" type="password" placeholder="Crea una password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {err && <div className="text-red-300 text-sm mb-2">{err}</div>}

            <button className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? "Creazione..." : "Crea account"}
            </button>

            <div className="text-center mt-4 text-white/80 text-sm">
                Hai già un account? <Link to="/login" className="link">Login</Link>
            </div>
        </div>
    );
}
