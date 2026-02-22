export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadData() {
  const [devices, connections, traffic] = await Promise.all([
    loadJson('data/devices.json'),
    loadJson('data/connections.json'),
    loadJson('data/traffic.json'),
  ]);
  return { devices, connections, traffic };
}

export function pollTraffic({ intervalMs = 5000, onUpdate }) {
  let timer;
  const tick = async () => {
    try {
      const data = await loadJson('data/traffic.json');
      onUpdate?.(data);
    } catch (err) {
      console.error(err);
    }
  };
  timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
