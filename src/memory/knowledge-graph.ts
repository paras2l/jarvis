export interface KnowledgeNode {
  id: string
  label: string
  type: 'person' | 'tool' | 'workflow' | 'goal' | 'fact'
  createdAt: number
}

export interface KnowledgeEdge {
  id: string
  from: string
  to: string
  relation: string
  createdAt: number
}

const NODES_KEY = 'patrich.knowledge.nodes'
const EDGES_KEY = 'patrich.knowledge.edges'

class KnowledgeGraph {
  private nodes: KnowledgeNode[] = this.load<KnowledgeNode>(NODES_KEY)
  private edges: KnowledgeEdge[] = this.load<KnowledgeEdge>(EDGES_KEY)

  addNode(label: string, type: KnowledgeNode['type']): KnowledgeNode {
    const node: KnowledgeNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      type,
      createdAt: Date.now(),
    }
    this.nodes.push(node)
    this.persist()
    return node
  }

  addEdge(from: string, to: string, relation: string): KnowledgeEdge {
    const edge: KnowledgeEdge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from,
      to,
      relation,
      createdAt: Date.now(),
    }
    this.edges.push(edge)
    this.persist()
    return edge
  }

  queryNeighbors(nodeId: string): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
    const edges = this.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId)
    const ids = new Set<string>([nodeId])
    edges.forEach((edge) => {
      ids.add(edge.from)
      ids.add(edge.to)
    })
    const nodes = this.nodes.filter((node) => ids.has(node.id))
    return { nodes, edges }
  }

  private persist(): void {
    localStorage.setItem(NODES_KEY, JSON.stringify(this.nodes.slice(-2000)))
    localStorage.setItem(EDGES_KEY, JSON.stringify(this.edges.slice(-4000)))
  }

  private load<T>(key: string): T[] {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw) as T[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

export const knowledgeGraph = new KnowledgeGraph()
