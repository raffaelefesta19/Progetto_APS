import React from "react";

export default function PublicLayout({
                                         children,
                                         bgVideo,
                                         bgImage,
                                     }: {
    children: React.ReactNode;
    bgVideo?: string;
    bgImage?: string;
}) {
    return (
        <div className="public-wrap">
            {/* Background video/image */}
            {bgVideo ? (
                <video
                    className="public-bg"
                    src={bgVideo}
                    autoPlay
                    muted
                    loop
                    playsInline
                />
            ) : bgImage ? (
                <div
                    className="public-bg"
                    style={{
                        backgroundImage: `url(${bgImage})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
            ) : null}

            {/* overlay per contrasto */}
            <div className="public-overlay" />

            {/* neon soft blobs */}
            <div className="public-blob public-blob--tl" />
            <div className="public-blob public-blob--br" />

            {/* contenuto */}
            <div className="public-content">{children}</div>
        </div>
    );
}
