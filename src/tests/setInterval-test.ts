// Test file to verify the ESLint rule for setInterval

function testSetInterval() {
  // This should now show a warning with the correct message
  const intervalId = setInterval(() => {
    console.log(
      'This is a background task that should continue running when the tab is not in focus',
    );
  }, 1000);

  return intervalId;
}

export default testSetInterval;
