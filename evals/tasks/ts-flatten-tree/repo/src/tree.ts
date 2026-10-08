export interface TreeNode {
  id: string;
  children?: TreeNode[];
}

// TODO: Implement flattenTree
export function flattenTree(root: TreeNode): Array<{ id: string; depth: number }> {
  throw new Error('Not implemented');
}
