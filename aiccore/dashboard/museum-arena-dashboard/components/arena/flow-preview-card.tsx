"use client"

import { cn } from "@/lib/utils"

interface FlowNode {
  id: string
  label: string
  type: "input" | "process" | "output" | "llm"
  x: number
  y: number
}

interface FlowEdge {
  from: string
  to: string
}

interface FlowPreviewProps {
  nodes: FlowNode[]
  edges: FlowEdge[]
  runningNodes?: string[]
  className?: string
}

const nodeColors: Record<FlowNode["type"], { bg: string; border: string; text: string }> = {
  input: { bg: "fill-sky-500/15", border: "stroke-sky-500/40", text: "fill-sky-300" },
  process: { bg: "fill-violet-500/15", border: "stroke-violet-500/40", text: "fill-violet-300" },
  output: { bg: "fill-emerald-500/15", border: "stroke-emerald-500/40", text: "fill-emerald-300" },
  llm: { bg: "fill-amber-500/15", border: "stroke-amber-500/40", text: "fill-amber-300" },
}

export function FlowPreviewCard({ nodes, edges, runningNodes = [], className }: FlowPreviewProps) {
  // Compute bounding box to auto-frame nodes
  const minX = nodes.length ? Math.min(...nodes.map(n => n.x || 0)) - 20 : 0
  const minY = nodes.length ? Math.min(...nodes.map(n => n.y || 0)) - 20 : 0
  const maxX = nodes.length ? Math.max(...nodes.map(n => (n.x || 0) + 72)) + 20 : 280
  const maxY = nodes.length ? Math.max(...nodes.map(n => (n.y || 0) + 24)) + 20 : 120

  const width = maxX - minX
  const height = maxY - minY
  const viewBox = `${minX} ${minY} ${width} ${height}`

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]))

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-secondary/50 ring-1 ring-border", className)}>
      <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* Grid dots */}
        <defs>
          <pattern id="grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" className="fill-muted-foreground/10" />
          </pattern>
        </defs>
        <rect x={minX} y={minY} width={width} height={height} fill="url(#grid-dots)" />

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodeMap[edge.from]
          const to = nodeMap[edge.to]
          if (!from || !to) return null

          const fromX = (from.x || 0) + 72
          const fromY = (from.y || 0) + 12
          const toX = to.x || 0
          const toY = (to.y || 0) + 12
          const midX = (fromX + toX) / 2

          return (
            <path
              key={i}
              d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
              fill="none"
              className="stroke-primary/40 animate-pulse"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const nodeType = node.type || "process"
          const colors = nodeColors[nodeType as keyof typeof nodeColors] || nodeColors.process
          const x = node.x || 0
          const y = node.y || 0

          const isRunning = runningNodes.includes(node.id)

          return (
            <g key={node.id} className={cn("transition-transform duration-200 origin-center hover:scale-105", isRunning && "animate-pulse")}>
              {isRunning && (
                <rect
                  x={x - 2}
                  y={y - 2}
                  width="76"
                  height="28"
                  rx="6"
                  className="fill-primary/20"
                />
              )}
              <rect
                x={x}
                y={y}
                width="72"
                height="24"
                rx="4"
                className={cn(colors.bg, colors.border, isRunning && "stroke-primary stroke-2 shadow-lg shadow-primary/50")}
                strokeWidth={isRunning ? "2" : "1.5"}
              />
              <text
                x={x + 36}
                y={y + 14}
                textAnchor="middle"
                className={cn("text-[6px] font-bold tracking-tight uppercase", colors.text)}
              >
                {node.label || "Node"}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
