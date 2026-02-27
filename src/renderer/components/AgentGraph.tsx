import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Position,
  Handle,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { TeamInfo, SessionMetadata } from '../../shared/ipc-types';

interface AgentGraphProps {
  team: TeamInfo;
  sessions: SessionMetadata[];
  onFocusSession: (sessionId: string) => void;
}

interface AgentNodeData {
  label: string;
  role: 'lead' | 'teammate';
  sessionId?: string;
  status?: string;
  [key: string]: unknown;
}

function AgentNode({ data }: { data: AgentNodeData }) {
  const isLead = data.role === 'lead';
  const borderColor = isLead ? '#fbbf24' : 'var(--accent-primary, #00C9A7)';
  const statusColor = data.status === 'running' ? 'var(--semantic-success, #3DD68C)'
    : data.status === 'exited' ? 'var(--semantic-error, #F7678E)'
    : 'var(--border-strong, #3D4163)';

  return (
    <div style={{
      background: 'var(--surface-raised, #13141C)',
      border: `2px solid ${borderColor}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 100,
      textAlign: 'center',
      position: 'relative',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--text-tertiary, #5C6080)', border: 'none', width: 6, height: 6 }} />
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-primary, #E2E4F0)',
        fontFamily: "var(--font-ui, 'Inter', system-ui, sans-serif)",
        marginBottom: 4,
      }}>
        {data.label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 500,
          color: borderColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {isLead ? 'LEAD' : 'TEAMMATE'}
        </span>
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: statusColor,
          display: 'inline-block',
        }} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--text-tertiary, #5C6080)', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

export function AgentGraph({ team, sessions, onFocusSession }: AgentGraphProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node<AgentNodeData>[] = [];
    const edges: Edge[] = [];

    const leadMember = team.members.find(m => m.agentType === 'lead');
    const teammates = team.members.filter(m => m.agentType === 'teammate');

    // Position lead at top center
    if (leadMember) {
      const session = sessions.find(s => s.agentId === leadMember.agentId);
      nodes.push({
        id: leadMember.agentId,
        type: 'agentNode',
        position: { x: 120, y: 20 },
        data: {
          label: leadMember.name,
          role: 'lead',
          sessionId: session?.id,
          status: session?.status || 'disconnected',
        },
      });
    }

    // Position teammates in a row below
    const spacing = 140;
    const totalWidth = (teammates.length - 1) * spacing;
    const startX = 120 - totalWidth / 2;

    teammates.forEach((member, i) => {
      const session = sessions.find(s => s.agentId === member.agentId);
      nodes.push({
        id: member.agentId,
        type: 'agentNode',
        position: { x: startX + i * spacing, y: 150 },
        data: {
          label: member.name,
          role: 'teammate',
          sessionId: session?.id,
          status: session?.status || 'disconnected',
        },
      });

      // Edge from lead to teammate
      if (leadMember) {
        edges.push({
          id: `${leadMember.agentId}-${member.agentId}`,
          source: leadMember.agentId,
          target: member.agentId,
          animated: true,
          style: { stroke: 'var(--border-strong, #3D4163)', strokeWidth: 1.5 },
        });
      }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [team, sessions]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((_: any, node: Node<AgentNodeData>) => {
    if (node.data.sessionId) {
      onFocusSession(node.data.sessionId);
    }
  }, [onFocusSession]);

  return (
    <div className="agent-graph" style={{ width: '100%', height: '100%', minHeight: 300 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--surface-raised, #13141C)' }}
      >
        <Controls
          showInteractive={false}
          style={{ background: 'var(--surface-overlay, #1A1B26)', border: '1px solid var(--border-default, #292E44)', borderRadius: 6 }}
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border-default, #292E44)" />
      </ReactFlow>

      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#fbbf24' }} />
          <span>Lead</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--accent-primary, #00C9A7)' }} />
          <span>Teammate</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--semantic-success, #3DD68C)' }} />
          <span>Running</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--border-strong, #3D4163)' }} />
          <span>Disconnected</span>
        </div>
      </div>

      <style>{agentGraphStyles}</style>
    </div>
  );
}

const agentGraphStyles = `
  .agent-graph {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-default, #292E44);
  }

  .agent-graph .react-flow__controls button {
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    color: var(--text-tertiary, #5C6080);
    width: 24px;
    height: 24px;
  }

  .agent-graph .react-flow__controls button:hover {
    background: var(--border-default, #292E44);
    color: var(--accent-primary, #00C9A7);
  }

  .agent-graph .react-flow__controls button svg {
    fill: currentColor;
  }

  .graph-legend {
    position: absolute;
    bottom: 8px;
    left: 8px;
    display: flex;
    gap: 10px;
    padding: 5px 8px;
    background: rgba(13, 14, 20, 0.85);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    z-index: 5;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--text-tertiary, #5C6080);
  }

  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
`;
