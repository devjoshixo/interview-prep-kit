// Soft, blurred gradient blobs that drift slowly behind the page. Decorative.
export default function Droplets() {
  const blobs = [
    { w: 340, h: 340, left: "-80px", top: "-60px", c: "#7A6CFF", anim: "drift-a 15s ease-in-out infinite" },
    { w: 300, h: 300, left: "22%", top: "38%", c: "#7C3AED", anim: "drift-b 19s ease-in-out infinite" },
    { w: 260, h: 260, right: "-40px", top: "10%", c: "#4f63c4", anim: "drift-c 17s ease-in-out infinite" },
    { w: 240, h: 240, left: "8%", bottom: "-70px", c: "#2f8f76", anim: "drift-a 21s ease-in-out infinite" },
    { w: 220, h: 220, right: "18%", bottom: "6%", c: "#b4823b", anim: "drift-b 23s ease-in-out infinite" },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {blobs.map((b, i) => (
        <span
          key={i}
          className="droplet"
          style={{
            width: b.w,
            height: b.h,
            left: b.left,
            right: b.right,
            top: b.top,
            bottom: b.bottom,
            background: `radial-gradient(circle at 32% 30%, ${b.c}, transparent 70%)`,
            animation: b.anim,
          }}
        />
      ))}
    </div>
  );
}
