# Fix Null Handling Bug

In `src/user.ts`, `getDisplayName(user)` throws an error when `user` or `user.profile` is null or undefined.
Update `getDisplayName` to safely handle null or undefined input and return `"Anonymous"` when no name is present.
