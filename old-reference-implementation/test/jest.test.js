// Simple test to verify Jest is working correctly
describe('Jest Setup', () => {
  test('should be able to run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect(true).toBeTruthy();
    expect(false).toBeFalsy();
  });

  test('should handle arrays and objects', () => {
    const testArray = [1, 2, 3];
    const testObject = { name: 'test', value: 42 };

    expect(testArray).toHaveLength(3);
    expect(testArray).toContain(2);
    expect(testObject).toHaveProperty('name');
    expect(testObject.name).toBe('test');
  });

  test('should handle async operations', async () => {
    const asyncFunction = () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve('async result'), 10);
      });
    };

    const result = await asyncFunction();
    expect(result).toBe('async result');
  });

  test('should handle mock functions', () => {
    const mockFn = jest.fn();
    mockFn('test argument');

    expect(mockFn).toHaveBeenCalled();
    expect(mockFn).toHaveBeenCalledWith('test argument');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
