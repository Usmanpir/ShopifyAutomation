import { cn } from "cn";

/**
 * Product thumbnail. Real image URLs render as <img>; demo "swatch:<shape>:<hex>"
 * URLs render a garment silhouette in the product colour (works offline).
 */
const SHAPES: Record<string, string> = {
  shirt: "M22 10 30 6h4c1 3 4 5 6 5s5-2 6-5h4l8 4 7 11-7 5-4-4v31H25V22l-4 4-7-5z M32 8l8 9 8-9",
  polo: "M22 10 30 6h5l5 6 5-6h5l8 4 7 11-7 5-4-4v31H25V22l-4 4-7-5z M40 12v8",
  trouser: "M26 6h28l3 50h-11l-6-34-6 34H23z M26 12h28",
  tracksuit: "M23 8 31 5h18l8 3 7 15-7 4-3-5v12H26V25l-3 5-7-4z M30 41h20l2 18h-9l-3-12-3 12h-9z M40 5v29",
  hoodie: "M24 13c0-6 7-9 16-9s16 3 16 9l7 3 6 22-7 3-5-14v30H25V27l-5 14-7-3 6-22z M33 8c2 5 5 7 7 7s5-2 7-7 M34 42h12",
  sweatshirt: "M24 11 32 7h16l8 4 7 3 6 24-7 3-5-15v30H25V26l-5 15-7-3 6-24z M34 7c1 3 3 4 6 4s5-1 6-4",
  jacket: "M23 9 31 5h18l8 4 6 4 5 26-7 2-4-14v30H24V27l-4 14-7-2 5-26z M40 6v51 M30 26h6 M44 26h6",
  coat: "M24 8 32 4h16l8 4 6 6 3 31-7 1-2-16v32H24V30l-2 16-7-1 3-31z M40 5l-6 18 6 34 M40 5l6 18-6 34",
  sweater: "M24 12 32 7h16l8 5 6 3 6 23-7 3-5-15v30H25V26l-5 15-7-3 6-23z M33 7c0 3 3 6 7 6s7-3 7-6 M25 50h30",
  accessory: "M14 34c0-4 4-7 8-7h36c4 0 8 3 8 7s-4 7-8 7H22c-4 0-8-3-8-7z M50 30h8v8h-8z",
};

function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function ProductImage({ src, alt, className, rounded = "rounded-lg" }: { src: string | null | undefined; alt: string; className?: string; rounded?: string }) {
  const base = cn("relative block shrink-0 overflow-hidden border bg-[var(--swatch-bg)]", rounded, className ?? "size-10");
  if (src && !src.startsWith("swatch:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={cn(base, "object-cover")} />;
  }
  const [, shape = "shirt", color = "#94a3b8"] = (src ?? "swatch:shirt:#94a3b8").split(":");
  const light = luminance(color) > 0.8;
  return (
    <span role="img" aria-label={alt} className={base}>
      <svg viewBox="0 0 80 64" className="absolute inset-0 size-full p-[14%]">
        <path d={SHAPES[shape] ?? SHAPES.shirt} fill={color} stroke={light ? "#94a3b8" : "rgba(0,0,0,0.25)"} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
