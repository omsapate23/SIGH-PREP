import React, { useEffect, useRef, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';

interface NetworkGraphProps {
  elements: any;
  activeFilters: string[];
  onNodeClick: (nodeData: any) => void;
}

export default function NetworkGraph({ elements, activeFilters, onNodeClick }: NetworkGraphProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  const flatElements = useMemo(() => {
    if (!elements) return [];
    if (Array.isArray(elements)) return elements;
    if (typeof elements === 'object' && ('nodes' in elements || 'edges' in elements)) {
      return [...(elements.nodes || []), ...(elements.edges || [])];
    }
    return [];
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (activeFilters.length === 0) {
      cy.nodes().classes('');
      cy.edges().style({ opacity: 0.6 });
      return;
    }

    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const type = node.data('type');
        if (activeFilters.includes(type)) {
          node.classes('focused');
        } else {
          node.classes('unfocused');
        }
      });

      cy.edges().forEach((edge) => {
        const sourceType = edge.source().data('type');
        const targetType = edge.target().data('type');
        if (activeFilters.includes(sourceType) || activeFilters.includes(targetType)) {
          edge.style({ opacity: 0.8 });
        } else {
          edge.style({ opacity: 0.1 });
        }
      });
    });
  }, [activeFilters, flatElements]);

  const styleSheet: any[] = [
    {
      selector: 'node',
      style: {
        'background-color': '#111827',
        label: 'data(label)',
        color: '#94a3b8',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        width: '40px',
        height: '40px',
        'border-width': 1,
        'border-color': '#FFFFFF',
        'text-outline-color': '#000000',
        'text-outline-width': 1,
        'transition-property': 'opacity, border-width, border-color, width, height',
        'transition-duration': 300,
      },
    },
    {
      selector: 'node.focused',
      style: {
        opacity: 1,
        width: '46px',
        height: '46px',
        'border-width': 2,
        'border-color': '#FFFFFF',
      },
    },
    {
      selector: 'node.unfocused',
      style: {
        opacity: 0.15,
        'border-width': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': '#334155',
        'target-arrow-color': '#334155',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '8px',
        color: '#94a3b8',
        'text-rotation': 'autorotate',
        'transition-property': 'opacity',
        'transition-duration': 300,
      },
    },
  ];

  const layout = {
    name: 'cose',
    animate: false,
    fit: true,
    padding: 30,
    nodeRepulsion: () => 400000,
    idealEdgeLength: () => 100,
  };

  return (
    <CytoscapeComponent
      elements={flatElements}
      style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}
      stylesheet={styleSheet}
      layout={layout}
      cy={(cy) => {
        cyRef.current = cy;
        cy.on('tap', 'node', (evt) => {
          onNodeClick(evt.target.data());
        });
        cy.on('tap', (evt) => {
          if (evt.target === cy) {
            onNodeClick(null);
          }
        });
      }}
    />
  );
}
