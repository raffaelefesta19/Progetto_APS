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
            <div className="public-overlay" />
            <div className="public-blob public-blob--tl" />
            <div className="public-blob public-blob--br" />
            <div className="public-content">{children}</div>
        </div>
    );
}
