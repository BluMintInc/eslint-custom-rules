// Test case for the issue
const filtered = [1, 2, 3].filter(item => item > 1);
if (filtered?.length) {
  console.log(filtered[0]);
}

// Another test case with undefined
let maybeArray: number[] | undefined;
if (maybeArray?.length) {
  console.log(maybeArray[0]);
}
