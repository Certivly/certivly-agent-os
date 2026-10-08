# Implement flattenTree function

In `src/tree.ts`, export an interface `TreeNode`:
```ts
export interface TreeNode {
  id: string;
  children?: TreeNode[];
}
```
And export `flattenTree(root: TreeNode): Array<{ id: string; depth: number }>` which performs a pre-order traversal (parent before children) and returns all node IDs with their corresponding 0-based depth level.
