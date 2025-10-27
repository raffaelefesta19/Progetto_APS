import React, { useMemo, useState } from "react";

type Props<T> = {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    initiallyVisible?: number; // default 3
    title?: string;
    totalLabel?: (n: number) => string;
    empty?: React.ReactNode;
    className?: string;
};

export default function ExpandableList<T>({
                                              items,
                                              renderItem,
                                              initiallyVisible = 3,
                                              title,
                                              totalLabel,
                                              empty = <div className="text-slate-500">Nessun elemento.</div>,
                                              className,
                                          }: Props<T>) {
    const [expanded, setExpanded] = useState(false);

    const visible = useMemo(
        () => (expanded ? items : items.slice(0, initiallyVisible)),
        [expanded, items, initiallyVisible]
    );

    const remaining = Math.max(items.length - initiallyVisible, 0);
    const showToggle = items.length > initiallyVisible;

    return (
        <div className={`w-full ${className ?? ""}`}>
            <div className="mb-2 flex items-center justify-between">
                {title ? (
                    <div className="text-lg font-semibold text-slate-800">{title}</div>
                ) : (
                    <div />
                )}
                {totalLabel ? (
                    <div className="text-sm text-slate-500">
                        {totalLabel(items.length)}
                    </div>
                ) : null}
            </div>

            {items.length === 0 ? (
                empty
            ) : (
                <>
                    <div
                        className={
                            expanded
                                ? "relative max-h-96 overflow-y-auto pr-1"
                                : "relative"
                        }
                    >
                        <div className="flex flex-col gap-3">
                            {visible.map((it, i) => (
                                <div key={i} className="w-full">
                                    {renderItem(it, i)}
                                </div>
                            ))}
                        </div>

                        {/* sfumatura morbida solo da chiuso */}
                        {!expanded && remaining > 0 && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14">
                                <div className="h-full w-full bg-gradient-to-b from-white/0 via-white/70 to-white" />
                            </div>
                        )}
                    </div>

                    {showToggle && !expanded && (
                        <div className="mt-3 flex justify-center">
                            <button
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                                onClick={() => setExpanded(true)}
                            >
                                Visualizza tutti
                            </button>
                        </div>
                    )}

                    {showToggle && expanded && (
                        <div className="mt-3 flex justify-center">
                            <button
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                                onClick={() => setExpanded(false)}
                            >
                                Riduci elenco
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
