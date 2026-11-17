/** A friendly dead end: the QR that was scanned cannot be used. Shared by the card and the shared-QR entries. */
export function Stop({ title, lines }: { title: string; lines: string[] }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 pt-[max(72px,env(safe-area-inset-top))] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/img/tree-seed.webp" width={84} height={84} style={{ width: 84, height: 84 }} />
      <h1 className="mt-5 mb-0 text-[24px] leading-8 font-bold tracking-[-0.5px] whitespace-pre-line">{title}</h1>
      {lines.map((l) => (
        <p key={l} className="mt-3 mb-0 text-[15px] leading-[22px] text-sub">
          {l}
        </p>
      ))}
    </main>
  );
}
