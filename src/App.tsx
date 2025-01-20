import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as d3 from 'd3';

interface NodeData extends Record<string, unknown> {
  label: string;
  description: string | null;
  tags: string[] | null;
}

interface ForceNodeData extends d3.SimulationNodeDatum {
  id: string;
  data: NodeData;
}

// Separate interfaces for the input data and D3 simulation
interface InputEdge {
  id: string;
  source: string;
  target: string;
}

interface GraphData {
  nodes: ForceNodeData[];
  edges: InputEdge[];
}

// D3 specific link type
interface SimLink extends d3.SimulationLinkDatum<ForceNodeData> {
  id: string;
}

// Define default edge options outside component
const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#b1b1b7',
  },
  type: 'smoothstep', // or 'bezier', 'straight', 'step' depending on your preference
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
  },
};

const getNodeColor = (tags: string[] | null): string => {
  if (!tags || tags.length === 0) return '#E5E7EB';
  if (tags.includes('#kafka')) return '#DBEAFE';
  return '#D1FAE5';
};

const getDomain = (url: string): string => {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
};

// CustomNode component with guaranteed handles
const CustomNode: React.FC<{ data: NodeData }> = React.memo(({ data }) => (
  <div
    className="rounded-lg border-2 border-gray-200 p-2 max-w-md relative"
    style={{ backgroundColor: getNodeColor(data.tags) }}
  >
    {/* Handle for incoming connections */}
    <Handle
      type="target"
      position={Position.Top}
      style={{
        background: '#555',
        width: 8,
        height: 8,
      }}
      isConnectable={true}
    />

    <div className="text-sm font-medium truncate" title={data.label}>
      {getDomain(data.label)}
    </div>
    {data.description && (
      <div className="text-xs text-gray-600 truncate mt-1" title={data.description}>
        {data.description}
      </div>
    )}
    {data.tags && data.tags.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1">
        {data.tags.map((tag) => (
          <span
            key={tag}
            className="bg-white bg-opacity-50 text-gray-700 text-xs px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    )}

    {/* Handle for outgoing connections */}
    <Handle
      type="source"
      position={Position.Bottom}
      style={{
        background: '#555',
        width: 8,
        height: 8,
      }}
      isConnectable={true}
    />
  </div>
));

CustomNode.displayName = 'CustomNode';

const nodeTypes = {
  default: CustomNode,
} as const;

const KnowledgeGraph: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const containerStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    position: 'relative',
  };

  const applyForceLayout = useCallback(
    (graphData: GraphData) => {
      // Create links array that matches D3's expected format
      const links: SimLink[] = graphData.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));

      const simulation = d3
        .forceSimulation<ForceNodeData>(graphData.nodes)
        .force(
          'link',
          d3
            .forceLink<ForceNodeData, SimLink>(links)
            .id((d) => d.id)
            .distance(100),
        )
        .force('charge', d3.forceManyBody<ForceNodeData>().strength(-100))
        .force('x', d3.forceX<ForceNodeData>().strength(0.1))
        .force('y', d3.forceY<ForceNodeData>().strength(0.1))
        .force('collision', d3.forceCollide<ForceNodeData>().radius(50));

      for (let i = 0; i < 300; ++i) simulation.tick();

      const nodesWithPositions: Node<NodeData>[] = graphData.nodes.map((node) => ({
        id: node.id,
        position: {
          x: (node.x ?? 0) * 3,
          y: (node.y ?? 0) * 3,
        },
        data: node.data,
        type: 'default',
        // Ensure node is connectable
        connectable: true,
      }));

      const formattedEdges = graphData.edges.map((edge) => ({
        id: edge.id,
        source: String(edge.source),
        target: String(edge.target),
        // Remove handle specifications to use default connections
        type: 'smoothstep',
        style: {
          stroke: '#b1b1b7',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
      }));

      setNodes(nodesWithPositions);
      setEdges(formattedEdges);
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        console.log('Fetching graph data...');
        const response = await fetch('/graces/graph', {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        const data: GraphData = await response.json();
        console.log('Raw edge data structure:', JSON.stringify(data.edges, null, 2));
        console.log('Received graph data:', data);

        if (!data.nodes || !data.edges) {
          console.error('Invalid data structure:', data);
          return;
        }

        console.log(`Found ${data.nodes.length} nodes and ${data.edges.length} edges`);
        console.log(
          'Edge data:',
          data.edges.map((edge) => ({
            ...edge,
            sourceNode: data.nodes.find((n) => n.id === edge.source),
            targetNode: data.nodes.find((n) => n.id === edge.target),
          })),
        );
        applyForceLayout(data);
      } catch (error) {
        console.error('Error fetching graph data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [applyForceLayout]);

  if (loading) {
    return (
      <div style={containerStyle} className="flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading knowledge graph...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="bg-gray-50"
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        attributionPosition="bottom-right"
        connectOnClick={false} // Disable click-to-connect behavior
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node: Node<NodeData>) => getNodeColor(node.data.tags)}
          className="bg-white rounded shadow-lg"
        />
      </ReactFlow>
    </div>
  );
};

export default KnowledgeGraph;
