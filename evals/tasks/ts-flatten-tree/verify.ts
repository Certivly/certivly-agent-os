import { flattenTree, type TreeNode } from './src/tree';

const tree: TreeNode = {
  id: 'root',
  children: [
    {
      id: 'child1',
      children: [
        { id: 'grandchild1' },
      ],
    },
    {
      id: 'child2',
    },
  ],
};

const result = flattenTree(tree);

const expected = [
  { id: 'root', depth: 0 },
  { id: 'child1', depth: 1 },
  { id: 'grandchild1', depth: 2 },
  { id: 'child2', depth: 1 },
];

if (JSON.stringify(result) !== JSON.stringify(expected)) {
  console.error('flattenTree produced incorrect result:', result);
  process.exit(1);
}

console.log('Verification passed: flattenTree works correctly.');
process.exit(0);
