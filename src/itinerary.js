// Seed trip. Approximate coords; drag a pin or re-search to correct.
// Stops with no lat/lng are listed but not pinned until you "Locate" them.
const P = {
  YVR: [49.1947, -123.1792],
  Vancouver: [49.2827, -123.1207],
  Hotel: null,
  'Canada Place': [49.2888, -123.111],
  Gastown: [49.2833, -123.1069],
  'Stanley Park': [49.3017, -123.1417],
  'Capilano Suspension Bridge Park': [49.3429, -123.1149],
  'Grouse Mountain': [49.3805, -123.0819],
  'Lighthouse Park': [49.3306, -123.2633],
  'Granville Island': [49.2712, -123.134],
  'Kitsilano Beach': [49.2745, -123.1546],
  'English Bay': [49.2866, -123.1425],
  'White Rock': [49.0198, -122.8028],
  Richmond: [49.1666, -123.1336],
  'Shannon Falls': [49.6702, -123.1567],
  'Sea-to-Sky Highway': [49.85, -123.15],
  Whistler: [50.1163, -122.9574],
  'Whistler Village': [50.1157, -122.9536],
  'Joffre Lakes': [50.3697, -122.4986],
}

const s = (place, key = place) => {
  const c = P[key]
  return { place, lat: c?.[0] ?? null, lng: c?.[1] ?? null }
}

export default [
  {
    date: 'Sep 12',
    stops: [
      s('Vancouver International Airport (YVR)', 'YVR'),
      s('Vancouver'),
      s('Hotel'),
      s('Vancouver'),
      s('Canada Place'),
      s('Gastown'),
      s('Hotel'),
    ],
  },
  {
    date: 'Sep 13',
    stops: [
      s('Hotel'),
      s('Stanley Park'),
      s('Capilano Suspension Bridge Park'),
      s('Grouse Mountain'),
      s('Grouse Mountain / Vancouver', 'Grouse Mountain'),
      s('Hotel'),
    ],
  },
  {
    date: 'Sep 14',
    stops: [
      s('Hotel'),
      s('Lighthouse Park'),
      s('Granville Island'),
      s('Kitsilano Beach'),
      s('English Bay'),
      s('Vancouver'),
      s('Hotel'),
    ],
  },
  {
    date: 'Sep 15',
    stops: [
      s('Hotel'),
      s('White Rock'),
      s('Vancouver / Richmond', 'Richmond'),
      s('Shannon Falls'),
      s('Sea-to-Sky Highway'),
      s('Whistler'),
      s('Whistler Village'),
      s('Hotel'),
    ],
  },
  {
    date: 'Sep 16',
    stops: [
      s('Hotel'),
      s('Joffre Lakes'),
      s('Whistler'),
      s('Hotel'),
      s('Whistler Village'),
    ],
  },
  {
    date: 'Sep 17',
    stops: [
      s('Hotel'),
      s('Vancouver'),
      s('Vancouver International Airport (YVR)', 'YVR'),
    ],
  },
]
