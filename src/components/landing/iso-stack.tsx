import { LogoPaths } from "./logo"

/** Isometric plane: flat drawing coordinates become the top face of a plate. */
const PLANE = "matrix(0.866 0.5 -0.866 0.5 0 0)"
const SIZE = 225
const DEPTH = 13

function Plate({
  fill,
  children,
}: {
  fill: "ink" | "card"
  children: React.ReactNode
}) {
  const half = SIZE * 0.866
  const tall = SIZE
  const face = fill === "ink" ? "fill-ink" : "fill-background"
  return (
    <>
      <path
        d={`M${-half} ${tall / 2} V${tall / 2 + DEPTH} L0 ${tall + DEPTH} V${tall} Z`}
        className="fill-background"
      />
      <path
        d={`M${half} ${tall / 2} V${tall / 2 + DEPTH} L0 ${tall + DEPTH} V${tall} Z`}
        className="fill-background"
      />
      <g transform={PLANE}>
        <rect width={SIZE} height={SIZE} className={face} />
        {children}
      </g>
    </>
  )
}

function InvoicePlate() {
  return (
    <Plate fill="card">
      <rect
        x="10"
        y="10"
        width="205"
        height="205"
        className="fill-background"
      />
      <rect x="20" y="20" width="118" height="74" className="fill-ink" />
      <rect x="146" y="20" width="59" height="20" className="fill-ink" />
      <rect x="146" y="47" width="59" height="20" className="fill-ink" />
      <rect x="146" y="74" width="59" height="20" className="fill-ink" />
      <rect x="20" y="104" width="118" height="101" className="fill-ink" />
      <g className="stroke-current" strokeWidth="0.6" opacity="0.55">
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="146"
            x2="205"
            y1={106 + i * 8.6}
            y2={106 + i * 8.6}
          />
        ))}
      </g>
      <text x="26" y="196" className="fill-current text-[9px]" opacity="0.7">
        INVOICE / 30,000 USDT
      </text>
    </Plate>
  )
}

function ClaimsPlate() {
  const rows = [150, 96, 176, 72, 128, 164]
  return (
    <Plate fill="card">
      <text x="16" y="24" className="fill-current text-[9px]" opacity="0.7">
        CLAIMS.DECLARE
      </text>
      {rows.map((width, index) => (
        <rect
          key={index}
          x={index % 2 === 0 ? 18 : 42}
          y={42 + index * 27}
          width={width}
          height="9"
          className="fill-current"
          opacity="0.4"
        />
      ))}
    </Plate>
  )
}

function AgentPlate() {
  return (
    <Plate fill="ink">
      <rect
        x="38"
        y="38"
        width="150"
        height="150"
        className="fill-background stroke-current"
        strokeWidth="0.75"
      />
      <text x="48" y="58" className="fill-current text-[9px]" opacity="0.7">
        TRUSTMEBRO AGENT
      </text>
      <text x="48" y="70" className="fill-current text-[9px]" opacity="0.7">
        PAY / RELAY / LOG
      </text>
      <g
        transform="translate(84 84) scale(2.7)"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <LogoPaths />
      </g>
    </Plate>
  )
}

function ContractPlate() {
  const crosses = Array.from({ length: 30 }, (_, i) => ({
    x: 22 + (i % 6) * 21,
    y: 66 + Math.floor(i / 6) * 19,
  }))
  const bars = Array.from({ length: 24 }, (_, i) => i)
  return (
    <Plate fill="card">
      <rect
        x="14"
        y="14"
        width="96"
        height="40"
        className="fill-background stroke-current"
        strokeWidth="0.75"
      />
      <text x="22" y="31" className="fill-current text-[9px]" opacity="0.7">
        TRADEDEALS
      </text>
      <text x="22" y="43" className="fill-current text-[9px]" opacity="0.7">
        CONTRACT
      </text>
      <g className="stroke-current" strokeWidth="0.6" opacity="0.5">
        {crosses.map(({ x, y }) => (
          <path key={`${x}-${y}`} d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} />
        ))}
      </g>
      <line
        x1="150"
        y1="0"
        x2="150"
        y2="225"
        className="stroke-current"
        strokeWidth="0.75"
      />
      <g className="fill-current" opacity="0.7">
        {bars.map((bar) => (
          <rect
            key={bar}
            x={bar % 3 === 0 ? 160 : 186}
            y={6 + bar * 9}
            width={bar % 5 === 0 ? 30 : 18}
            height={bar % 4 === 0 ? 7 : 3}
          />
        ))}
      </g>
    </Plate>
  )
}

const plates = [InvoicePlate, ClaimsPlate, AgentPlate, ContractPlate]

/**
 * Isometric stack with one plate per step of the deal. Plates start evenly
 * spaced, and the page moves them through their `data-plate` groups.
 */
export function IsoStack({
  ref,
  className,
}: {
  ref?: React.Ref<SVGSVGElement>
  className?: string
}) {
  return (
    <svg
      ref={ref}
      viewBox="-215 -303 430 830"
      aria-hidden="true"
      className={className}
    >
      {plates
        .map((PlateArt, index) => ({ PlateArt, index }))
        .reverse()
        .map(({ PlateArt, index }) => (
          <g
            key={index}
            data-plate=""
            style={{ transform: `translateY(${(index - 1.5) * 96}px)` }}
            className="text-primary will-change-transform"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
          >
            <PlateArt />
          </g>
        ))}
    </svg>
  )
}
