import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import PublicLayout from "./PublicLayout";

export default function PublicShell() {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    return (
        <PublicLayout bgVideo="/videoplayback.mp4">
            <div className="public-content">
                <Outlet />
            </div>
        </PublicLayout>
    );
}
