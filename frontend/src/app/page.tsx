"use client";

import React, { useState, useEffect, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import { Search, UploadCloud, User, Smartphone, Car, Info, X } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SnareDashboard() {
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    fetchGraph();
  }, []);

  const fetchGraph = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/graph');
      setElements(res.data);
    } catch (err) {
      console.error("Failed to fetch graph:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    setIsUploading(true);
    try {
      await axios.post('http://localhost:8000/api/ingest', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchGraph();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleFilter = (type: string) => {
    setActiveFilters(prev => 
      prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type]
    );
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (activeFilters.length === 0) {
      // Reset all styles
      cy.nodes().style({ 'opacity': 1, 'border-width': 0 });
      cy.edges().style({ 'opacity': 0.6 });
      return;
    }

    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const type = node.data('type');
        if (activeFilters.includes(type)) {
          node.style({
            'opacity': 1,
            'border-width': 2,
            'border-color': '#ffffff'
          });
        } else {
          node.style({
            'opacity': 0.2,
            'border-width': 0
          });
        }
      });
      
      cy.edges().forEach((edge) => {
        const sourceType = edge.source().data('type');
        const targetType = edge.target().data('type');
        if (activeFilters.includes(sourceType) || activeFilters.includes(targetType)) {
           edge.style({ 'opacity': 0.8 });
        } else {
           edge.style({ 'opacity': 0.1 });
        }
      });
    });
  }, [activeFilters, elements]);

  const styleSheet: cytoscape.Stylesheet[] = [
    {
      selector: 'node',
      style: {
        'background-color': '#475569',
        'label': 'data(label)',
        'color': '#f8fafc',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'width': '40px',
        'height': '40px',
        'text-outline-color': '#0f172a',
        'text-outline-width': 1,
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': 300,
      }
    },
    {
      selector: 'node[type = "Person"]',
      style: { 'background-color': '#64748b' }
    },
    {
      selector: 'node[type = "Phone"]',
      style: { 'shape': 'rectangle', 'background-color': '#334155' }
    },
    {
      selector: 'node[type = "Vehicle"]',
      style: { 'shape': 'triangle', 'background-color': '#94a3b8' }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#334155',
        'target-arrow-color': '#334155',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '8px',
        'color': '#94a3b8',
        'text-rotation': 'autorotate',
        'transition-property': 'opacity',
        'transition-duration': 300,
      }
    }
  ];

  const layout = { name: 'cose', animate: true };

  return (
    <div className="flex flex-col h-screen bg-black text-slate-200 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-black z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-xl">S</div>
          <h1 className="text-xl tracking-widest font-bold">S.N.A.R.E. <span className="text-slate-500 font-normal">// TACTICAL COMMAND</span></h1>
        </div>
        <div className="relative w-64">
          <input 
            type="text" 
            placeholder="Search network..." 
            className="w-full bg-slate-900 border border-slate-700 rounded-none py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:border-slate-500 focus:bg-slate-800 transition-colors"
          />
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col z-10">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">Data Ingestion</h2>
            <label className={cn(
              "flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-900 transition-colors cursor-pointer group",
              isUploading && "opacity-50 cursor-not-allowed"
            )}>
              <UploadCloud className="w-6 h-6 text-slate-500 group-hover:text-slate-300 mb-2" />
              <span className="text-xs text-slate-500 group-hover:text-slate-300">
                {isUploading ? "INGESTING..." : "UPLOAD PDF"}
              </span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
          </div>

          <div className="p-4 flex-1">
            <h2 className="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">Entity Filters</h2>
            <div className="space-y-2">
              <button 
                onClick={() => toggleFilter('Person')}
                className={cn("w-full flex items-center gap-3 px-3 py-2 border text-sm transition-colors", 
                  activeFilters.includes('Person') ? "bg-slate-800 border-slate-500 text-white" : "border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900")}
              >
                <User className="w-4 h-4" /> PERSONS
              </button>
              <button 
                onClick={() => toggleFilter('Phone')}
                className={cn("w-full flex items-center gap-3 px-3 py-2 border text-sm transition-colors", 
                  activeFilters.includes('Phone') ? "bg-slate-800 border-slate-500 text-white" : "border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900")}
              >
                <Smartphone className="w-4 h-4" /> PHONES
              </button>
              <button 
                onClick={() => toggleFilter('Vehicle')}
                className={cn("w-full flex items-center gap-3 px-3 py-2 border text-sm transition-colors", 
                  activeFilters.includes('Vehicle') ? "bg-slate-800 border-slate-500 text-white" : "border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900")}
              >
                <Car className="w-4 h-4" /> VEHICLES
              </button>
            </div>
          </div>
        </aside>

        {/* Central Canvas */}
        <main className={cn(
          "flex-1 relative bg-[#0a0a0a]"
        )}>
          {elements.length > 0 ? (
            <CytoscapeComponent
              elements={elements}
              style={{ width: '100%', height: '100%' }}
              stylesheet={styleSheet}
              layout={layout}
              cy={(cy) => {
                cyRef.current = cy;
                cy.on('tap', 'node', (evt) => {
                  setSelectedNode(evt.target.data());
                });
                cy.on('tap', (evt) => {
                  if (evt.target === cy) {
                    setSelectedNode(null);
                  }
                });
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600">
              <div className="text-center">
                <div className="w-16 h-16 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6" />
                </div>
                <p>NO GRAPH DATA. INGEST INTEL TO BEGIN.</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Drawer */}
        <aside className={cn(
          "absolute right-0 top-0 h-full w-80 bg-slate-950 border-l border-slate-800 transform transition-transform duration-300 z-20",
          selectedNode ? "translate-x-0" : "translate-x-full"
        )}>
          {selectedNode && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-white tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-400" /> DOSSIER
                </h3>
                <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Entity ID</div>
                  <div className="font-mono text-sm break-all">{selectedNode.id}</div>
                </div>
                <div className="mb-6">
                  <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Classification</div>
                  <div className="inline-block px-2 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300">
                    {selectedNode.type}
                  </div>
                </div>
                <div className="mb-6">
                  <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Designation</div>
                  <div className="text-lg text-white font-medium">{selectedNode.label}</div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-800">
                  <div className="text-xs text-slate-600 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse"></span>
                    MONITORING ACTIVE
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
