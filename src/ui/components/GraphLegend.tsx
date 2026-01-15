import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from './ui/button';

export function GraphLegend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {/* Toggle button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 h-auto"
        >
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            Legend
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>

        {/* Legend content */}
        {expanded && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t">
            {/* Node colors */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Status Colors
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{ borderColor: 'var(--graph-status-open)' }}
                  />
                  <span className="text-sm">Open</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{ borderColor: 'var(--graph-status-in-progress)' }}
                  />
                  <span className="text-sm">In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{ borderColor: 'var(--graph-status-blocked)' }}
                  />
                  <span className="text-sm">Blocked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{ borderColor: 'var(--graph-status-closed)' }}
                  />
                  <span className="text-sm">Closed</span>
                </div>
              </div>
            </div>

            {/* Type icons */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Issue Types
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-center">◯</span>
                  <span className="text-sm">Task</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 text-center">🐛</span>
                  <span className="text-sm">Bug</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 text-center">◆</span>
                  <span className="text-sm">Epic</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 text-center">🔍</span>
                  <span className="text-sm">Verification</span>
                </div>
              </div>
            </div>

            {/* Edge types */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Connections
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <svg width="32" height="16" className="flex-shrink-0">
                    <line
                      x1="2"
                      y1="8"
                      x2="30"
                      y2="8"
                      stroke="var(--graph-edge-blocked)"
                      strokeWidth="2"
                    />
                    <polygon
                      points="30,8 24,4 24,12"
                      fill="var(--graph-edge-blocked)"
                    />
                  </svg>
                  <span className="text-sm">Blocked by (open)</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="32" height="16" className="flex-shrink-0">
                    <line
                      x1="2"
                      y1="8"
                      x2="30"
                      y2="8"
                      stroke="var(--graph-edge-resolved)"
                      strokeWidth="2"
                    />
                    <polygon
                      points="30,8 24,4 24,12"
                      fill="var(--graph-edge-resolved)"
                    />
                  </svg>
                  <span className="text-sm">Blocked by (resolved)</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="32" height="16" className="flex-shrink-0">
                    <line
                      x1="2"
                      y1="8"
                      x2="30"
                      y2="8"
                      stroke="var(--graph-edge-parent)"
                      strokeWidth="2"
                      strokeDasharray="4,3"
                    />
                    <polygon
                      points="30,8 24,4 24,12"
                      fill="var(--graph-edge-parent)"
                    />
                  </svg>
                  <span className="text-sm">Parent-child</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="32" height="16" className="flex-shrink-0">
                    <line
                      x1="2"
                      y1="8"
                      x2="30"
                      y2="8"
                      stroke="var(--graph-edge-verifies)"
                      strokeWidth="2"
                      strokeDasharray="3,2"
                    />
                    <polygon
                      points="30,8 24,4 24,12"
                      fill="var(--graph-edge-verifies)"
                    />
                  </svg>
                  <span className="text-sm">Verifies</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
