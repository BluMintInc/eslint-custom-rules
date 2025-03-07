// Test case for object property access with OR operator for default value
const roles = (channel?.data?.roles || {});

// Test case for array property access with OR operator for default value
const items = (roles[role] || []).map(item => item.id);

// Test case for nested property access with OR operator
const value = (obj?.prop?.subProp || {}).value;

// Test case for function result with OR operator
const result = (getResult() || {}).value;
