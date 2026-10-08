# Fix Off-By-One Bug

There is an off-by-one bug in `src/array-slice.ts` inside `takeElements(arr, count)`.
Fix the loop condition so it does not exceed the count or the array bounds.
