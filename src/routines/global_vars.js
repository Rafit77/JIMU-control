const store = new Map(); // key: variable name, value: any

export const varGet = (name) => store.get(String(name ?? ''));

export const varSet = (name, value) => {
  store.set(String(name ?? ''), value);
};

export const varClearAll = () => {
  store.clear();
};

