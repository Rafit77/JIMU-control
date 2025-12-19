const store = new Map(); // key: variable name, value: any

export const varGet = (name) => store.get(String(name ?? ''));

export const varSet = (name, value) => {
  store.set(String(name ?? ''), value);
};

export const varDefine = (name, initialValue = 0) => {
  const key = String(name ?? '');
  if (!key) return;
  if (!store.has(key)) store.set(key, initialValue);
};

export const varList = () => Array.from(store.keys()).sort((a, b) => a.localeCompare(b));

export const varClearAll = () => {
  store.clear();
};

export const varExport = () => Object.fromEntries(store.entries());

export const varImport = (obj) => {
  store.clear();
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) store.set(String(k ?? ''), v);
};
