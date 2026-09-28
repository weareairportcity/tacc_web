// The polaroid card and pile layout, shared by the send form and the wall.

// Where each card sits in the pile, by pile size. x/y are % of the card width.
// The last pose belongs to the front card, so it always lands near the centre.
export const POSES: Record<number, { x: number; y: number; r: number }[]> = {
  1: [{ x: 0, y: 0, r: -2 }],
  2: [
    { x: -16, y: 6, r: -7 },
    { x: 12, y: 0, r: 4 },
  ],
  3: [
    { x: -28, y: 10, r: -9 },
    { x: 28, y: 8, r: 8 },
    { x: 0, y: 0, r: 2 },
  ],
};

const paper = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.07 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

export function Polaroid({
  pose,
  z,
  onBringForward,
  children,
}: {
  pose: { x: number; y: number; r: number };
  z: number;
  onBringForward?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onBringForward}
      className={`absolute inset-x-0 top-0 bg-[#fdfdfb] px-[6%] pt-[6%] shadow-[0_1px_2px_rgba(0,0,0,0.1),0_14px_30px_-10px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out ${
        onBringForward ? "cursor-pointer" : ""
      }`}
      style={{
        zIndex: z,
        backgroundImage: paper,
        transform: `translate(${pose.x}%, ${pose.y}%) rotate(${pose.r}deg)`,
      }}
    >
      {children}
    </div>
  );
}
