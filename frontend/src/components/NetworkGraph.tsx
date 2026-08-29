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
    // ignore if already registered
  }
}

interface NetworkGraphProps {
  elements: any;
  activeFilters: string[];
  searchQuery: string;
  onSelectNode: (nodeData: any) => void;
}

export default function NetworkGraph({
  elements,
  activeFilters,
  searchQuery,
  onSelectNode,
}: NetworkGraphProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Compute flat elements and calculate node weights based on connected edge degree
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
        edges.push(el);
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
      return {
        ...node,
        data: {
          ...node.data,
          weight,
        },
      };
    });

    return [...weightedNodes, ...edges];
  }, [elements]);

  const layout = useMemo(
    () => ({
      name: 'cola',
      animate: true,
      refresh: 1, // continuous jiggle
      maxSimulationTime: 4000,
      nodeSpacing: 50,
      edgeLengthVal: 80,
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
          'background-color': '#64748B',
          label: 'data(label)',
          color: '#FFFFFF',
          'font-family': 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          'font-size': '12px',
          'font-weight': 500,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'text-halign': 'center',
          width: 'mapData(weight, 1, 10, 40, 100)',
          height: 'mapData(weight, 1, 10, 40, 100)',
          'border-width': 0,
          'text-outline-color': '#000000',
          'text-outline-width': 2,
          'transition-property': 'opacity, border-width, border-color, background-color, width, height',
          'transition-duration': 250,
        },
      },
      // Color-coded entity types
      {
        selector: 'node[type = "Person"]',
        style: {
          'background-color': '#F97316', // Orange
          shape: 'ellipse',
        },
      },
      {
        selector: 'node[type = "Phone"]',
        style: {
          'background-color': '#EF4444', // Red
          shape: 'rectangle',
        },
      },
      {
        selector: 'node[type = "Vehicle"]',
        style: {
          'background-color': '#8B5CF6', // Purple
          shape: 'triangle',
        },
      },
      {
        selector: 'node[type = "Account"]',
        style: {
          'background-color': '#3B82F6', // Blue
          shape: 'diamond',
        },
      },
      {
        selector: 'node[type = "Location"]',
        style: {
          'background-color': '#10B981', // Green
          shape: 'pentagon',
        },
      },
      {
        selector: 'node[type = "Organization"]',
        style: {
          'background-color': '#EC4899', // Pink
          shape: 'hexagon',
        },
      },
      // States: Focused / Unfocused / Highlighted
      {
        selector: 'node.focused',
        style: {
          opacity: 1,
          'border-width': 3.5,
          'border-color': '#FFFFFF',
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
          'background-color': '#FFFFFF',
          color: '#000000',
          'border-color': '#FFFFFF',
          'border-width': 3.5,
          'z-index': 1000,
          'text-outline-color': '#FFFFFF',
          'text-outline-width': 0,
        },
      },
      // Edges styling
      {
        selector: 'edge',
        style: {
          width: 1.5,
          'line-color': '#475569',
          'target-arrow-color': '#475569',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: 'data(label)',
          'font-family': 'Inter, system-ui, sans-serif',
          'font-size': '9px',
          color: '#94a3b8',
          'text-rotation': 'autorotate',
          'text-background-color': '#000000',
          'text-background-opacity': 0.85,
          'text-background-padding': '2px',
          'transition-property': 'opacity, line-color, target-arrow-color',
          'transition-duration': 250,
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

  // Depth-of-field multi-select activeFilters effect
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      if (!activeFilters || activeFilters.length === 0) {
        cy.nodes().removeClass('focused unfocused');
        cy.edges().removeClass('unfocused');
        cy.edges().style({ opacity: 0.7 });
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
          edge.style({ opacity: 0.9 });
        } else {
          edge.addClass('unfocused');
          edge.style({ opacity: 0.1 });
        }
      });
    });
  }, [activeFilters, flatElements]);

  // Omnibar Search effect with animated Pan/Zoom
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const trimmed = searchQuery.trim().toLowerCase();
    cy.batch(() => {
      cy.nodes().removeClass('highlighted');

      if (!trimmed) return;

      const matchingNodes = cy.nodes().filter((node) => {
        const label = String(node.data('label') || '').toLowerCase();
        const id = String(node.data('id') || '').toLowerCase();
        const type = String(node.data('type') || '').toLowerCase();
        const aliases = String(node.data('aliases') || '').toLowerCase();
        return (
          label.includes(trimmed) ||
          id.includes(trimmed) ||
          type.includes(trimmed) ||
          aliases.includes(trimmed)
        );
      });

      matchingNodes.addClass('highlighted');

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
          title="Re-run Cola Physics Layout"
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
          });
          cy.on('tap', (evt) => {
            if (evt.target === cy) {
              onSelectNode(null);
            }
          });
        }}
      />
    </div>
  );
}
