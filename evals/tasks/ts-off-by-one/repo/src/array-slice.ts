export function takeElements<T>(arr: T[], length: number): T[] {
  const result: T[] = [];
  for (let i = 0; i <= length; i++) {
    if (i < arr.length) {
      result.push(arr[i]);
    }
  }
  return result;
}
