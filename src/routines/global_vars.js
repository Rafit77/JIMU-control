const store = new Map(); // key: variable name, value: {value:any, init:any}

const normalizeEntry = (entry, fallback = 0) => {
  if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return {
      value: entry.value,
      init: Object.prototype.hasOwnProperty.call(entry, 'init') ? entry.init : entry.value,
    };
  }
  return { value: entry ?? fallback, init: entry ?? fallback };
};

export const varGet = (name) => store.get(String(name ?? ''))?.value;

export const varSet = (name, value) => {
  const key = String(name ?? '');
  if (!key) return;
  const prev = store.get(key);
  const next = prev ? { ...prev, value } : { value, init: value };
  store.set(key, next);
};

export const varInitGet = (name) => store.get(String(name ?? ''))?.init;

export const varInitSet = (name, initValue) => {
  const key = String(name ?? '');
  if (!key) return;
  const prev = store.get(key);
  const next = prev ? { ...prev, init: initValue } : { value: initValue, init: initValue };
  store.set(key, next);
};

export const varResetToInit = () => {
  for (const [k, v] of store.entries()) {
    store.set(k, { ...(v || {}), value: v?.init });
  }
};

export const varDefine = (name, initialValue = 0) => {
  const key = String(name ?? '');
  if (!key) return;
  if (!store.has(key)) store.set(key, { value: initialValue, init: initialValue });
};

export const varList = () => Array.from(store.keys()).sort((a, b) => a.localeCompare(b));

export const varClearAll = () => {
  store.clear();
};

export const varExport = () => Object.fromEntries(Array.from(store.entries()).map(([k, v]) => [k, { value: v?.value, init: v?.init }]));

export const varImport = (obj) => {
  store.clear();
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k ?? '');
    if (!key) continue;
    store.set(key, normalizeEntry(v, 0));
  }
};
