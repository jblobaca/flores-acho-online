// Zonas de delivery desde el Mercado de Flores de Acho (Rímac) — HU-18.
// Costo en céntimos de sol y tiempo estimado en minutos.
const ZONES = {
  'rimac': { label: 'Rímac', costCents: 600, etaMin: 40 },
  'cercado de lima': { label: 'Cercado de Lima', costCents: 800, etaMin: 50 },
  'san martin de porres': { label: 'San Martín de Porres', costCents: 1000, etaMin: 60 },
  'san juan de lurigancho': { label: 'San Juan de Lurigancho', costCents: 1400, etaMin: 75 },
  'miraflores': { label: 'Miraflores', costCents: 1500, etaMin: 80 },
  'san isidro': { label: 'San Isidro', costCents: 1500, etaMin: 75 },
  'surco': { label: 'Santiago de Surco', costCents: 1800, etaMin: 90 },
  'la molina': { label: 'La Molina', costCents: 2000, etaMin: 100 },
};

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export function quoteDelivery(district) {
  const zone = ZONES[normalize(district)];
  return zone ? { covered: true, ...zone } : { covered: false };
}

export const DISTRICTS = Object.values(ZONES).map((z) => z.label);
export const SLOTS = ['09:00-12:00', '12:00-15:00', '15:00-18:00'];
