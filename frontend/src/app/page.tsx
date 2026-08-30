"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  ShieldAlert,
  Search,
  X,
  Trash2,
  UploadCloud,
  Terminal,
  User,
  Smartphone,
  Car,
  CreditCard,
  MapPin,
  Building2,
  ExternalLink,
  FileText,
  AlertTriangle,
  Activity,
  Filter,
} from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import NetworkGraph from '@/components/NetworkGraph';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FILTER_CONFIG = [
  { type: 'Person', label: 'Persons', icon: User },
  { type: 'Phone', label: 'Phones', icon: Smartphone },
  { type: 'Vehicle', label: 'Vehicles', icon: Car },
  { type: 'Account', label: 'Accounts', icon: CreditCard },
  { type: 'Location', label: 'Locations', icon: MapPin },
  { type: 'Organization', label: 'Organizations', icon: Building2 },
];

export default function SnareDashboard() {
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([
    '[SYSTEM_BOOT] S.N.A.R.E. Engine active. Deterministic extraction & Cola Physics ready.',
    '[IDLE] Awaiting case payload (FIR / CDR CSV / Audio Intercept)...',
  ]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setTelemetryLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [telemetryLogs]);

  useEffect(() => {
    fetchGraph();
  }, []);

  const fetchGraph = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/graph');
      if (res.data && (Array.isArray(res.data.nodes) || Array.isArray(res.data.edges))) {
        setGraphData({
          nodes: res.data.nodes || [],
          edges: res.data.edges || [],
        });
      } else if (Array.isArray(res.data)) {
        setGraphData({
          nodes: res.data.filter((item: any) => !item.data?.source),
          edges: res.data.filter((item: any) => item.data?.source),
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch graph:', err);
      addLog(`[ERROR] Backend connection failed: ${err.message || err}`);
    }
  };

  const processUploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const ext = file.name.split('.').pop()?.toLowerCase();
    setIsProcessing(true);
    addLog(`[AUTO_PURGE] Wiped previous case graph to avoid overlap.`);
    addLog(`[INGEST] Loading payload: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    if (ext === 'csv') {
      addLog('[CDR_PARSER] Fast-path: Processing Call Detail Record via Pandas engine...');
    } else if (ext === 'wav' || ext === 'mp3') {
      addLog('[FASTER_WHISPER] Transcribing offline audio via GPU Faster-Whisper...');
    } else {
      addLog('[QWEN_GPU] Dispatched text segment to local Qwen 2.5 7B model...');
    }

    try {
      const res = await axios.post('http://localhost:8000/api/ingest', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      addLog('[NEO4J_SYNC] Ingested entity graph with MERGE idempotency.');

      let incomingData = res.data;
      if (incomingData?.data) {
        incomingData = incomingData.data;
      }

      if (incomingData?.nodes || incomingData?.edges) {
        const nodeCount = incomingData.nodes?.length || 0;
        const edgeCount = incomingData.edges?.length || 0;
        addLog(`[EXTRACTED] Resolution complete: ${nodeCount} entities, ${edgeCount} relationships.`);
        setGraphData({
          nodes: incomingData.nodes || [],
          edges: incomingData.edges || [],
        });
      } else {
        await fetchGraph();
      }

      addLog('[SYSTEM_READY] Canvas refreshed. Purple severity gradient active.');
    } catch (err: any) {
      console.error('Ingestion failed:', err);
      addLog(`[ERROR] Extraction sequence failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      processUploadFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: isProcessing,
  });

  const handlePurgeGraph = async () => {
    if (!confirm('CONFIRM PURGE: Clear entire criminal network graph from Neo4j database?')) {
      return;
    }
    try {
      addLog('[PURGE_DISPATCH] Sending detach delete sequence to Neo4j...');
      await axios.delete('http://localhost:8000/api/graph');
      setGraphData({ nodes: [], edges: [] });
      setSelectedNode(null);
      setActiveFilters([]);
      setSearchQuery('');
      addLog('[PURGE_COMPLETE] Neo4j graph cleared. Canvas memory flushed.');
    } catch (err: any) {
      console.error('Purge failed:', err);
      addLog(`[ERROR] Failed to purge database: ${err.response?.data?.detail || err.message}`);
    }
  };

  const toggleFilter = (type: string) => {
    setActiveFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Entity Counts for Badges
  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Person: 0,
      Phone: 0,
      Vehicle: 0,
      Account: 0,
      Location: 0,
      Organization: 0,
    };
    (graphData.nodes || []).forEach((n: any) => {
      const type = n.data?.type || 'Unknown';
      if (counts[type] !== undefined) {
        counts[type]++;
      }
    });
    return counts;
  }, [graphData.nodes]);

  // Compute 1-Hop Connected Neighbors for Selected Node
  const connectedLinks = useMemo(() => {
    if (!selectedNode || !selectedNode.id) return [];
    const nodeId = String(selectedNode.id);
    const links: Array<{
      targetId: string;
      targetLabel: string;
      targetType: string;
      relation: string;
      direction: 'outgoing' | 'incoming';
      nodeData: any;
    }> = [];

    const nodeMap = new Map<string, any>();
    (graphData.nodes || []).forEach((n: any) => {
      if (n.data?.id) {
        nodeMap.set(String(n.data.id), n.data);
      }
    });

    (graphData.edges || []).forEach((e: any) => {
      const src = String(e.data?.source);
      const tgt = String(e.data?.target);
      const label = e.data?.label || 'CONNECTED';

      if (src === nodeId) {
        const targetNode = nodeMap.get(tgt);
        links.push({
          targetId: tgt,
          targetLabel: targetNode?.label || tgt,
          targetType: targetNode?.type || 'Unknown',
          relation: label,
          direction: 'outgoing',
          nodeData: targetNode,
        });
      } else if (tgt === nodeId) {
        const srcNode = nodeMap.get(src);
        links.push({
          targetId: src,
          targetLabel: srcNode?.label || src,
          targetType: srcNode?.type || 'Unknown',
          relation: label,
          direction: 'incoming',
          nodeData: srcNode,
        });
      }
    });

    return links;
  }, [selectedNode, graphData]);

  const hasNodes = graphData.nodes && graphData.nodes.length > 0;

  return (
    <div className="flex flex-col h-screen bg-[#000000] text-slate-200 font-mono overflow-hidden select-none">
      {/* 1. TOP BAR (48px) */}
      <header className="h-12 border-b border-[#1E293B] bg-[#000000] px-4 flex items-center justify-between z-20 shrink-0">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#FFFFFF] text-[#000000] flex items-center justify-center font-bold text-sm rounded-[2px]">
            <ShieldAlert className="w-4 h-4 text-black" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-[#FFFFFF]">
              S.N.A.R.E. <span className="text-[#94A3B8] font-normal">// TACTICAL COMMAND</span>
            </span>
            <span className="px-1.5 py-0.5 bg-[#111827] border border-[#333333] text-[9px] text-[#94A3B8] font-mono tracking-wider rounded-[2px]">
              LAW ENFORCEMENT SENSITIVE
            </span>
          </div>
        </div>

        {/* Center: Omnibar Search */}
        <div className="relative w-96">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search targets, identifiers, aliases, locations..."
            className="w-full bg-[#0B0F19] border border-[#1E293B] focus:border-[#FFFFFF] rounded-[2px] py-1 pl-8 pr-7 text-xs text-[#FFFFFF] placeholder:text-[#475569] font-mono focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-[#94A3B8] hover:text-[#FFFFFF]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Graph Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-[#94A3B8] mr-2">
            <Activity className="w-3.5 h-3.5 text-green-500 animate-pulse" />
            <span>NODES: {graphData.nodes?.length || 0}</span>
            <span>EDGES: {graphData.edges?.length || 0}</span>
          </div>
          <button
            onClick={handlePurgeGraph}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-transparent border border-[#333333] hover:border-[#FFFFFF] hover:bg-[#FFFFFF] hover:text-[#000000] text-[11px] text-[#94A3B8] tracking-wider transition-all rounded-[2px]"
            title="Wipe Neo4j Graph Database"
          >
            <Trash2 className="w-3.5 h-3.5" />
            PURGE GRAPH
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 2. LEFT SIDEBAR (300px) */}
        <aside className="w-[300px] border-r border-[#1E293B] bg-[#000000] flex flex-col z-10 shrink-0 overflow-y-auto">
          {/* SECTION 1: DATA INGESTION */}
          <div className="p-3.5 border-b border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase text-[#FFFFFF] tracking-widest font-bold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#FFFFFF]" />
                DATA INGESTION
              </span>
            </div>
            
            {/* React Dropzone Native Drag & Drop */}
            <div
              {...getRootProps()}
              className={cn(
                'flex flex-col items-center justify-center h-20 border border-dashed transition-all cursor-pointer rounded-[2px] group mb-3',
                isDragActive
                  ? 'border-[#FFFFFF] bg-[#1E293B] scale-[0.99]'
                  : 'border-[#1E293B] hover:border-slate-500 hover:bg-[#0B0F19] bg-[#000000]',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              <UploadCloud
                className={cn(
                  'w-5 h-5 mb-1 transition-colors',
                  isDragActive ? 'text-white scale-110' : 'text-[#94A3B8] group-hover:text-[#FFFFFF]'
                )}
              />
              <span className="text-[10px] text-[#94A3B8] group-hover:text-[#FFFFFF] tracking-wider uppercase font-medium text-center px-2">
                {isDragActive
                  ? 'DROP FILE TO INGEST NOW'
                  : isProcessing
                  ? 'EXTRACTING INTELLIGENCE...'
                  : 'DROP FIR / CDR CSV / AUDIO (.WAV)'}
              </span>
            </div>

            {/* Real-time Telemetry Stream Terminal with restricted height */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase text-[#94A3B8] tracking-wider font-semibold flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-[#FFFFFF]" />
                  Telemetry Stream
                </span>
                {isProcessing && (
                  <span className="text-[8px] text-amber-400 bg-amber-950/40 border border-amber-800 px-1 py-0.2 rounded-[2px] animate-pulse">
                    PARSING
                  </span>
                )}
              </div>
              <div
                ref={logContainerRef}
                className="bg-[#0B0F19] border border-[#1E293B] p-2 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed text-[#94A3B8] space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800 rounded-[2px]"
              >
                {telemetryLogs.map((log, index) => (
                  <div
                    key={index}
                    className={cn(
                      'break-words',
                      log.includes('[ERROR]') && 'text-red-400 font-semibold',
                      log.includes('[NEO4J_SYNC]') && 'text-[#FFFFFF] font-semibold',
                      log.includes('[CDR_PARSER]') && 'text-cyan-400 font-semibold',
                      log.includes('[FASTER_WHISPER]') && 'text-emerald-400 font-semibold',
                      log.includes('[QWEN_GPU]') && 'text-[#FFFFFF]',
                      log.includes('[EXTRACTED]') && 'text-emerald-400',
                      log.includes('[AUTO_PURGE]') && 'text-amber-400',
                      log.includes('[PURGE') && 'text-amber-400'
                    )}
                  >
                    {log}
                  </div>
                ))}
                <div className="flex items-center text-[#FFFFFF] pt-0.5">
                  <span className="text-[9px]">&gt;</span>
                  <span className="inline-block w-1.5 h-2.5 bg-[#FFFFFF] animate-pulse ml-1" />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CANVAS FILTERS */}
          <div className="p-3.5 flex-1">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] uppercase text-[#FFFFFF] tracking-widest font-bold flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#FFFFFF]" />
                CANVAS FILTERS
              </span>
              {activeFilters.length > 0 && (
                <button
                  onClick={() => setActiveFilters([])}
                  className="text-[9px] text-[#94A3B8] hover:text-[#FFFFFF] uppercase underline transition-colors"
                >
                  Clear ({activeFilters.length})
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {FILTER_CONFIG.map((item) => {
                const Icon = item.icon;
                const isActive = activeFilters.includes(item.type);
                const count = entityCounts[item.type] || 0;
                return (
                  <button
                    key={item.type}
                    onClick={() => toggleFilter(item.type)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 border text-xs tracking-wider uppercase transition-all rounded-[2px]',
                      isActive
                        ? 'bg-[#FFFFFF] border-[#FFFFFF] text-[#000000] font-bold shadow-sm'
                        : 'border-[#1E293B] bg-[#0B0F19] text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-[#000000]' : 'text-[#94A3B8]')} />
                      <span>{item.label}</span>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-[2px] font-mono font-semibold',
                        isActive ? 'bg-[#000000] text-[#FFFFFF]' : 'bg-[#111827] text-slate-400'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 3. CENTRAL CANVAS AREA */}
        <main className="flex-1 relative bg-[#000000] overflow-hidden">
          {hasNodes ? (
            <NetworkGraph
              elements={graphData}
              activeFilters={activeFilters}
              searchQuery={searchQuery}
              onSelectNode={(data) => setSelectedNode(data)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#475569] bg-[#000000] z-0">
              <div className="w-14 h-14 border border-[#1E293B] rounded-[2px] flex items-center justify-center mb-3 bg-[#0B0F19]">
                <ShieldAlert className="w-6 h-6 text-[#333333]" />
              </div>
              <p className="text-xs tracking-widest uppercase text-[#94A3B8]">
                No Active Intel On Canvas
              </p>
              <p className="text-[10px] text-[#475569] tracking-wider mt-1 uppercase">
                Drop FIR (.PDF/.TXT), CDR (.CSV), or Audio (.WAV) to resolve network
              </p>
            </div>
          )}
        </main>

        {/* 4. RIGHT DRAWER: TARGET DOSSIER (360px) */}
        <aside
          className={cn(
            'absolute right-0 top-0 h-full w-[360px] bg-[#0B0F19] border-l border-[#1E293B] transform transition-transform duration-300 z-20 flex flex-col shadow-2xl',
            selectedNode ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          {selectedNode && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3.5 border-b border-[#1E293B] flex items-center justify-between bg-[#000000]">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-[#FFFFFF] text-[#000000] text-[9px] font-bold tracking-widest uppercase rounded-[2px]">
                    {selectedNode.type || 'TARGET'}
                  </span>
                  <h3 className="text-xs font-bold text-[#FFFFFF] tracking-wider uppercase">
                    Target Dossier
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[#94A3B8] hover:text-[#FFFFFF] transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4 font-mono">
                {/* Designation & Threat Score */}
                <div className="bg-[#000000] p-3 border border-[#1E293B] rounded-[2px]">
                  <div className="text-[9px] uppercase text-[#475569] tracking-widest mb-1">
                    Designation
                  </div>
                  <div className="text-sm text-[#FFFFFF] font-bold tracking-wide">
                    {selectedNode.label || selectedNode.id}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-1 break-all">
                    ID: {selectedNode.id}
                  </div>

                  {/* Threat Score Bar */}
                  <div className="mt-3 pt-3 border-t border-[#1E293B]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] uppercase text-[#94A3B8] tracking-widest">
                        Threat Assessment
                      </span>
                      <span className="text-xs font-bold text-[#FFFFFF]">
                        {(selectedNode.threat_score ?? selectedNode.data?.threat_score ?? selectedNode.risk ?? selectedNode.data?.risk) ?? 0}/100
                      </span>
                    </div>
                    <div className="w-full bg-[#111827] h-2 rounded-[1px] overflow-hidden border border-[#333333]">
                      <div
                        className="h-full bg-[#FFFFFF] transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, Number(selectedNode.threat_score ?? selectedNode.data?.threat_score ?? selectedNode.risk ?? selectedNode.data?.risk) || 0))}%`,
                        }}
                      />
                    </div>
                    <div className="text-[8px] font-mono text-[#64748B] mt-1.5 tracking-wider uppercase">
                      [CALCULATED VIA STRUCTURAL DEGREE CENTRALITY]
                    </div>
                  </div>
                </div>

                {/* Section 1: Attributes & Identifiers */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2">
                    Attributes &amp; Identifiers
                  </div>
                  <div className="bg-[#000000] border border-[#1E293B] text-[10px] divide-y divide-[#1E293B] rounded-[2px]">
                    <div className="p-2 flex justify-between">
                      <span className="text-[#475569] uppercase">Classification</span>
                      <span className="text-[#FFFFFF]">{selectedNode.type || 'Unknown'}</span>
                    </div>
                    {selectedNode.aliases && (
                      <div className="p-2 flex justify-between">
                        <span className="text-[#475569] uppercase">Known Aliases</span>
                        <span className="text-[#FFFFFF]">{selectedNode.aliases}</span>
                      </div>
                    )}
                    {selectedNode.last_seen && (
                      <div className="p-2 flex justify-between">
                        <span className="text-[#475569] uppercase">Last Known Loc</span>
                        <span className="text-[#FFFFFF]">{selectedNode.last_seen}</span>
                      </div>
                    )}
                    {selectedNode.details && (
                      <div className="p-2">
                        <div className="text-[#475569] uppercase mb-1">Involvement Summary</div>
                        <div className="text-[#94A3B8] leading-relaxed">{selectedNode.details}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Connected Links (1-Hop Neighbors) */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2 flex items-center justify-between">
                    <span>1-Hop Connected Neighbors</span>
                    <span className="text-[#475569]">({connectedLinks.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {connectedLinks.length > 0 ? (
                      connectedLinks.map((link, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (link.nodeData) {
                              setSelectedNode(link.nodeData);
                            }
                          }}
                          className="bg-[#000000] border border-[#1E293B] hover:border-[#FFFFFF] p-2 flex items-center justify-between text-[10px] cursor-pointer transition-colors rounded-[2px]"
                        >
                          <div className="flex flex-col">
                            <span className="text-[#FFFFFF] font-semibold">{link.targetLabel}</span>
                            <span className="text-[#475569] text-[9px] uppercase">
                              {link.direction === 'outgoing' ? '→' : '←'} {link.relation} ({link.targetType})
                            </span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                        </div>
                      ))
                    ) : (
                      <div className="bg-[#000000] border border-[#1E293B] p-2 text-[10px] text-[#475569] text-center rounded-[2px]">
                        No direct links mapped.
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Evidence Provenance (Explainable AI) */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-[#FFFFFF]" />
                    Evidence Provenance (XAI Citation)
                  </div>
                  <div className="bg-[#000000] border-l-2 border-[#FFFFFF] border-y border-r border-[#1E293B] p-2.5 text-[10px] leading-relaxed text-[#94A3B8] italic rounded-[2px]">
                    {selectedNode.evidence ? (
                      <span>&ldquo;{selectedNode.evidence}&rdquo;</span>
                    ) : (
                      <span className="text-[#475569]">
                        Automated inference from report text. Primary citation pending manual forensic log review.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-[#1E293B] bg-[#000000] flex items-center justify-between text-[9px] text-[#475569]">
                <span className="tracking-widest uppercase">CASE FILE ACTIVE</span>
                <span className="text-[#94A3B8]">CONFIDENTIAL // AGY-ENCLAVE</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
