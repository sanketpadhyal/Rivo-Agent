module.exports = {
  root: true,
  extends: '@react-native',
  env: {
    jest: true,
    node: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'no-unused-vars': 'warn',
    'react-native/no-inline-styles': 'warn',
  },
};
