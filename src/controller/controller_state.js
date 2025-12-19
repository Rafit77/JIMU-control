const store = {
  sliders: new Map(), // name -> number
  switches: new Map(), // name -> boolean
  joysticks: new Map(), // name -> {x,y}
  indicators: new Map(), // name -> hex string
  displays: new Map(), // name -> any
};

const listeners = new Set(); // (event) => void

const emit = (event) => {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (_) {
      // ignore
    }
  }
};

export const subscribe = (fn) => {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const resetAll = () => {
  store.sliders.clear();
  store.switches.clear();
  store.joysticks.clear();
  store.indicators.clear();
  store.displays.clear();
  emit({ type: 'reset' });
};

export const sliderGet = (name) => Number(store.sliders.get(String(name ?? '')) ?? 0);
export const sliderSet = (name, value) => {
  const k = String(name ?? '');
  store.sliders.set(k, Number(value ?? 0));
  emit({ type: 'slider', name: k, value: store.sliders.get(k) });
};

export const switchGet = (name) => Boolean(store.switches.get(String(name ?? '')) ?? false);
export const switchSet = (name, value) => {
  const k = String(name ?? '');
  store.switches.set(k, Boolean(value));
  emit({ type: 'switch', name: k, value: store.switches.get(k) });
};

export const joystickGet = (name) => store.joysticks.get(String(name ?? '')) || { x: 0, y: 0 };
export const joystickGetAxis = (name, axis) => {
  const j = joystickGet(name);
  return axis === 'y' ? Number(j?.y ?? 0) : Number(j?.x ?? 0);
};
export const joystickSet = (name, xy) => {
  const k = String(name ?? '');
  const next = { x: Number(xy?.x ?? 0), y: Number(xy?.y ?? 0) };
  store.joysticks.set(k, next);
  emit({ type: 'joystick', name: k, value: next });
};

export const indicatorGet = (name) => String(store.indicators.get(String(name ?? '')) ?? '#000000');
export const indicatorSet = (name, hex) => {
  const k = String(name ?? '');
  store.indicators.set(k, String(hex || '#000000'));
  emit({ type: 'indicator', name: k, value: store.indicators.get(k) });
};

export const displayGet = (name) => store.displays.get(String(name ?? ''));
export const displaySet = (name, value) => {
  const k = String(name ?? '');
  store.displays.set(k, value);
  emit({ type: 'display', name: k, value });
};

