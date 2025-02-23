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

interface InputEdge {
  id: string;
  source: string;
  target: string;
}

interface GraphData {
  nodes: ForceNodeData[];
  edges: InputEdge[];
}

interface SimLink extends d3.SimulationLinkDatum<ForceNodeData> {
  id: string;
}

const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#b1b1b7',
  },
  type: 'smoothstep',
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

const CustomNode: React.FC<{ data: NodeData }> = React.memo(({ data }) => (
  <div
    className="rounded-lg border-2 border-gray-200 p-2 max-w-md relative"
    style={{ backgroundColor: getNodeColor(data.tags) }}
  >
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
        connectable: true,
      }));

      const formattedEdges = graphData.edges.map((edge) => ({
        id: edge.id,
        source: String(edge.source),
        target: String(edge.target),
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
        console.log('Fetching all node IDs...');
        const nodesResponse = await fetch('/graphs/nodes', {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        const nodeIdsData = await nodesResponse.json();
        
        console.log('Fetching connections for each node...');
        const connectionPromises = nodeIdsData.id.map(async (nodeId: string) => {
          const response = await fetch(`/graphs/${nodeId}/connections`, {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });
          return response.json();
        });

        const connectionsData = await Promise.all(connectionPromises);

        // Process all connection data to build complete graph
        const allNodes = new Map<string, ForceNodeData>();
        const edgeMap = new Map<string, InputEdge>();

        connectionsData.forEach(data => {
          // Add this node and its neighbors to the nodes map
          if (data.this) {
            allNodes.set(data.this.id, data.this);
          }
          data.neighbors?.forEach((neighbor: ForceNodeData) => {
            allNodes.set(neighbor.id, neighbor);
          });

          // Add edges
          data.edges?.forEach((edge: InputEdge) => {
            const edgeKey = `${edge.source}-${edge.target}`;
            if (!edgeMap.has(edgeKey)) {
              edgeMap.set(edgeKey, edge);
            }
          });
        });

        const graphData: GraphData = {
          nodes: Array.from(allNodes.values()),
          edges: Array.from(edgeMap.values())
        };

        console.log(`Found ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`);
        applyForceLayout(graphData);
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
        connectOnClick={false}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const typedNode = node as Node<NodeData>;
            return getNodeColor(typedNode.data.tags);
          }}
          className="bg-white rounded shadow-lg"
        />
      </ReactFlow>
    </div>
  );
};

export default KnowledgeGraph;