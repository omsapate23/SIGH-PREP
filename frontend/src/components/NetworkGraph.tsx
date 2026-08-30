"use client";

import React, { useEffect, useRef, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import { Maximize2, RefreshCw } from 'lucide-react';

if (typeof window !== 'undefined') {
  try {
    cytoscape.use(cola);
  } catch {
    // Ignore if already registered
  }
}

interface NetworkGraphProps {
  elements: any;
  activeFilters: string[];
  searchQuery: string;
  onSelectNode: (nodeData: any) => void;
  onSelectEdge?: (edgeData: any) => void;
}

// Base64 Encoded SVG Icons (White stroke, transparent fill)
const SVG_ICONS = {
  Person:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTkgMjF2LTJhNCA0IDAgMCAwLTQtNEg5YTQgNCAwIDAgMC00IDR2MiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIvPjwvc3ZnPg==',
  Phone:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTQiIGhlaWdodD0iMjAiIHg9IjUiIHk9IjIiIHJ4PSIyIiByeT0iMiIvPjxwYXRoIGQ9Ik0xMiAxOGguMDEiLz48L3N2Zz4=',
  Vehicle:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTkgMTdoMmMuNiAwIDEtLjQgMS0xdi0zYzAtLjktLjctMS43LTEuNS0xLjlDMTguNyAxMC42IDE2IDEwIDE2IDEwcy0xLjMtMS40LTIuMi0yLjNjLS41LS40LTEuMS0uNy0xLjgtLjdINWMtLjYgMC0xLjEuNC0xLjQuOWwtMS40IDIuOUEzLjcgMy43IDAgMCAwIDIgMTJ2NGMwIC42LjQgMSAxIDFoMiIvPjxjaXJjbGUgY3g9IjciIGN5PSIxNyIgcj0iMiIvPjxwYXRoIGQ9Ik05IDE3aDYiLz48Y2lyY2xlIGN4PSIxNyIgY3k9IjE3IiByPSIyIi8+PC9zdmc+',
  Account:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMTQiIHg9IjIiIHk9IjUiIHJ4PSIyIiByeT0iMiIvPjxwYXRoIGQ9Ik0xMiAxOGguMDEiLz48L3N2Zz4=',
  Location:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgMTBjMCA0Ljk5My01LjUzOSAxMC4xOTMtNy4zOTkgMTEuNzk5YTEgMSAwIDAgMS0xLjIwMiAwQzkuNTM5IDIwLjE5MyA0IDE0Ljk5MyA0IDEwYTggOCAwIDAgMSAxNiAwIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMCIgcj0iMyIvPjwvc3ZnPg==',
  Organization:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMjAiIHg9IjQiIHk9IjIiIHJ4PSIyIiByeT0iMiIvPjxwYXRoIGQ9Ik05IDIydi00aDZ2NCIvPjxwYXRoIGQ9Ik04IDZoLjAxIi8+PHBhdGggZD0iTTE2IDZoLjAxIi8+PHBhdGggZD0iTTggMTBoLjAxIi8+PHBhdGggZD0iTTE2IDEwaC4wMSIvPjxwYXRoIGQ9Ik04IDE0aC4wMSIvPjxwYXRoIGQ9Ik0xNiAxNGguMDEiLz48L3N2Zz4=',
  Digital_Artifact:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMjAiIHg9IjQiIHk9IjIiIHJ4PSIyIiByeT0iMiIvPjxwYXRoIGQ9Ik05IDIydi00aDZ2NCIvPjxwYXRoIGQ9Ik04IDZoLjAxIi8+PHBhdGggZD0iTTE2IDZoLjAxIi8+PHBhdGggZD0iTTEyIDZoLjAxIi8+PHBhdGggZD0iTTEyIDEwaC4wMSIvPjxwYXRoIGQ9Ik0xMiAxNGguMDEiLz48cGF0aCBkPSJNMTYgMTBoLjAxIi8+PHBhdGggZD0iTTggMTBoLjAxIi8+PC9zdmc+',
  Crime_Event:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJtMjEuNzMgMTgtOC0xNGEyIDIgMCAwIDAtMy40OCAwbC04IDE0QTIgMiAwIDAgMCA0IDIxaDE2YTIgMiAwIDAgMCAxLjczLTNaIi8+PHBhdGggZD0iTTEyIDl2NCIvPjxwYXRoIGQ9Ik0xMiAxN2guMDEiLz48L3N2Zz4=',
};

const formatNomenclature = (str: string) => {
  if (!str) return '';
  return str.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function NetworkGraph({
  elements,
  activeFilters,
  searchQuery,
  onSelectNode,
  onSelectEdge,
}: NetworkGraphProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Compute flat elements and calculate degree weight & sanitized risk for each node
  const flatElements = useMemo(() => {
    let rawList: any[] = [];
    if (!elements) rawList = [];
    else if (Array.isArray(elements)) rawList = elements;
    else if (typeof elements === 'object' && ('nodes' in elements || 'edges' in elements)) {
      rawList = [...(elements.nodes || []), ...(elements.edges || [])];
    }

    const nodes: any[] = [];
    const edges: any[] = [];
    const degreeMap: Record<string, number> = {};

    rawList.forEach((el) => {
      if (el.data?.source && el.data?.target) {
        const rawLabel = el.data?.label || 'CONNECTED';
        const formattedLabel = formatNomenclature(rawLabel);
        edges.push({
          ...el,
          data: {
            ...el.data,
            label: formattedLabel,
            raw_label: rawLabel,
          },
        });
        const src = String(el.data.source);
        const tgt = String(el.data.target);
        degreeMap[src] = (degreeMap[src] || 0) + 1;
        degreeMap[tgt] = (degreeMap[tgt] || 0) + 1;
      } else if (el.data?.id) {
        nodes.push(el);
      }
    });

    const weightedNodes = nodes.map((node) => {
      const id = String(node.data.id);
      const weight = Math.max(1, degreeMap[id] || 1);
      const threatScore = Math.min(
        100,
        Math.max(0, Number(node.data?.threat_score !== undefined ? node.data.threat_score : node.data?.risk) || 0)
      );
      return {
        ...node,
        data: {
          ...node.data,
          weight,
          risk: threatScore,
          threat_score: threatScore,
        },
      };
    });

    return [...weightedNodes, ...edges];
  }, [elements]);

  const layout = useMemo(
    () => ({
      name: 'cola',
      animate: true,
      refresh: 1, // Continuous jiggle physics
      maxSimulationTime: 4000,
      nodeSpacing: 50,
      randomize: false,
      centerGraph: true,
    }),
    []
  );

  const styleSheet: any[] = useMemo(
    () => [
      {
        selector: 'node',
        style: {
          shape: 'ellipse',
          label: 'data(label)',
          color: '#ffffff',
          'font-family': 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          'font-size': '11px',
          'font-weight': 500,
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-halign': 'center',
          width: 'mapData(weight, 1, 15, 32, 84)',
          height: 'mapData(weight, 1, 15, 32, 84)',
          // Monochromatic Purple shades according to threat/risk severity (0 to 100)
          'background-color': 'mapData(risk, 0, 100, #d8b4fe, #3b0764)',
          'border-width': 1.5,
          'border-color': '#475569',
          'text-outline-color': '#000000',
          'text-outline-width': 2,
          'background-image-opacity': 0.95,
          'background-width': '52%',
          'background-height': '52%',
          'background-fit': 'none',
          'background-clip': 'node',
          'transition-property': 'opacity, border-width, border-color, background-color, width, height',
          'transition-duration': 250,
        },
      },
      // Node Role Border Colors (Immediate visual distinction)
      {
        selector: 'node[role = "Suspect"]',
        style: {
          'border-color': '#ef4444',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Victim"]',
        style: {
          'border-color': '#3b82f6',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Officer"]',
        style: {
          'border-color': '#10b981',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Witness"]',
        style: {
          'border-color': '#f59e0b',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Mule_Account"]',
        style: {
          'border-color': '#ec4899',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Tool"], node[role = "Digital_Artifact"]',
        style: {
          'border-color': '#8b5cf6',
          'border-width': 2.5,
        },
      },
      {
        selector: 'node[role = "Infrastructure"]',
        style: {
          'border-color': '#64748b',
          'border-width': 2,
        },
      },
      // Base64 SVGs for Entity Types
      {
        selector: 'node[type = "Person"]',
        style: {
          'background-image': SVG_ICONS.Person,
        },
      },
      {
        selector: 'node[type = "Phone"]',
        style: {
          'background-image': SVG_ICONS.Phone,
        },
      },
      {
        selector: 'node[type = "Vehicle"]',
        style: {
          'background-image': SVG_ICONS.Vehicle,
        },
      },
      {
        selector: 'node[type = "Account"]',
        style: {
          'background-image': SVG_ICONS.Account,
        },
      },
      {
        selector: 'node[type = "Location"]',
        style: {
          'background-image': SVG_ICONS.Location,
        },
      },
      {
        selector: 'node[type = "Organization"]',
        style: {
          'background-image': SVG_ICONS.Organization,
        },
      },
      {
        selector: 'node[type = "Digital_Artifact"], node[type = "Tool"]',
        style: {
          'background-image': SVG_ICONS.Digital_Artifact,
        },
      },
      {
        selector: 'node[type = "Crime_Event"]',
        style: {
          'background-image': SVG_ICONS.Crime_Event,
        },
      },
      // States: Focused / Unfocused / Highlighted
      {
        selector: 'node.focused',
        style: {
          opacity: 1,
          'border-width': 3,
          'border-color': '#ffffff',
          'z-index': 999,
        },
      },
      {
        selector: 'node.unfocused',
        style: {
          opacity: 0.15,
        },
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-color': '#ffffff',
          'border-width': 3.5,
          'background-color': '#ffffff',
          color: '#000000',
          'text-outline-color': '#ffffff',
          'text-outline-width': 0,
          'z-index': 1000,
        },
      },
      // Crisp Actionable Edges
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#475569',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#475569',
          'arrow-scale': 0.7,
          'curve-style': 'bezier',
          'line-style': 'dashed',
          'line-dash-pattern': [4, 10],
          'line-dash-offset': 0,
          label: 'data(label)',
          'font-family': 'Inter, system-ui, -apple-system, sans-serif',
          'font-size': '9px',
          'font-weight': 600,
          color: '#94a3b8',
          'text-rotation': 'autorotate',
          'text-background-color': '#0b0f19',
          'text-background-opacity': 0.85,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-border-opacity': 0.6,
          'text-border-color': '#1e293b',
          'text-border-width': 1,
          'transition-property': 'opacity, line-color, width',
          'transition-duration': 250,
        },
      },
      {
        selector: 'edge.highlighted-edge, edge:selected',
        style: {
          'line-color': '#c084fc',
          'target-arrow-color': '#c084fc',
          width: 3.5,
          color: '#ffffff',
          'text-background-color': '#1e293b',
          'text-border-color': '#c084fc',
          'z-index': 999,
        },
      },
      {
        selector: 'edge.unfocused',
        style: {
          opacity: 0.1,
        },
      },
    ],
    []
  );

  // Animated Flowing Edge Dots Loop
  useEffect(() => {
    let animId: number;
    let offset = 0;

    const animateEdges = () => {
      offset -= 0.6;
      if (offset <= -14) offset = 0;
      if (cyRef.current) {
        cyRef.current.edges().style('line-dash-offset', offset);
      }
      animId = requestAnimationFrame(animateEdges);
    };

    animId = requestAnimationFrame(animateEdges);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [flatElements]);

  // Depth-of-field multi-select activeFilters effect
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      if (!activeFilters || activeFilters.length === 0) {
        cy.nodes().removeClass('focused unfocused');
        cy.edges().removeClass('unfocused');
        cy.edges().style({ opacity: 0.85 });
        return;
      }

      cy.nodes().forEach((node) => {
        const type = node.data('type');
        if (activeFilters.includes(type)) {
          node.addClass('focused');
          node.removeClass('unfocused');
        } else {
          node.addClass('unfocused');
          node.removeClass('focused');
        }
      });

      cy.edges().forEach((edge) => {
        const sourceType = edge.source().data('type');
        const targetType = edge.target().data('type');
        if (activeFilters.includes(sourceType) || activeFilters.includes(targetType)) {
          edge.removeClass('unfocused');
          edge.style({ opacity: 0.95 });
        } else {
          edge.addClass('unfocused');
          edge.style({ opacity: 0.1 });
        }
      });
    });
  }, [activeFilters, flatElements]);

  // Omnibar Search effect with animated Pan/Zoom & Highlighted Edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const trimmed = searchQuery.trim().toLowerCase();
    cy.batch(() => {
      cy.nodes().removeClass('highlighted');
      cy.edges().removeClass('highlighted-edge');

      if (!trimmed) return;

      const matchingNodes = cy.nodes().filter((node) => {
        const label = String(node.data('label') || '').toLowerCase();
        const id = String(node.data('id') || '').toLowerCase();
        const type = String(node.data('type') || '').toLowerCase();
        const role = String(node.data('role') || '').toLowerCase();
        const aliases = String(node.data('aliases') || '').toLowerCase();
        return (
          label.includes(trimmed) ||
          id.includes(trimmed) ||
          type.includes(trimmed) ||
          role.includes(trimmed) ||
          aliases.includes(trimmed)
        );
      });

      matchingNodes.addClass('highlighted');
      matchingNodes.connectedEdges().addClass('highlighted-edge');

      if (matchingNodes.length > 0) {
        cy.animate(
          {
            fit: {
              eles: matchingNodes,
              padding: 60,
            },
          },
          { duration: 400 }
        );
      }
    });
  }, [searchQuery]);

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.animate(
        {
          fit: {
            eles: cyRef.current.elements(),
            padding: 40,
          },
        },
        { duration: 300 }
      );
    }
  };

  const handleRelayout = () => {
    if (cyRef.current) {
      cyRef.current.layout(layout).run();
    }
  };

  return (
    <div className="relative w-full h-full bg-[#000000] overflow-hidden select-none">
      {/* Background dotted grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Floating Canvas Quick Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-[#0B0F19]/90 border border-[#1E293B] p-1 rounded-sm backdrop-blur-sm">
        <button
          onClick={handleFit}
          title="Reset Zoom & Fit View"
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors rounded-none"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          FIT
        </button>
        <div className="w-[1px] h-3.5 bg-slate-800" />
        <button
          onClick={handleRelayout}
          title="Re-run Cola Force Simulation"
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors rounded-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          COLA
        </button>
      </div>

      <CytoscapeComponent
        elements={flatElements}
        style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
        stylesheet={styleSheet}
        layout={layout}
        cy={(cy) => {
          cyRef.current = cy;
          cy.on('tap', 'node', (evt) => {
            onSelectNode(evt.target.data());
            if (onSelectEdge) onSelectEdge(null);
          });
          cy.on('tap', 'edge', (evt) => {
            onSelectNode(null);
            if (onSelectEdge) onSelectEdge(evt.target.data());
          });
          cy.on('tap', (evt) => {
            if (evt.target === cy) {
              onSelectNode(null);
              if (onSelectEdge) onSelectEdge(null);
            }
          });
        }}
      />
    </div>
  );
}
