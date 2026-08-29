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

const s = (time, place, note, key = place) => {
  const c = P[key]
  return { time, place, note, lat: c?.[0] ?? null, lng: c?.[1] ?? null }
}

export default [
  {
    date: 'Sep 12',
    stops: [
      s('11:00 am', 'Vancouver International Airport (YVR)', 'Arrive at Vancouver International Airport', 'YVR'),
      s('Morning', 'Vancouver', 'Luggage + travel downtown'),
      s('12:30 pm', 'Hotel', 'Drop luggage / check in'),
      s('Noon', 'Vancouver', 'Lunch'),
      s('Afternoon', 'Canada Place', 'Waterfront, North Shore mountain views'),
      s('Afternoon', 'Gastown', 'Water Street, Steam Clock, Historic streets'),
      s('Evening', 'Gastown', 'Dinner'),
      s('Evening', 'Hotel', 'Relax / hotel'),
    ],
  },
  {
    date: 'Sep 13',
    stops: [
      s('Morning', 'Hotel', 'Breakfast'),
      s('Morning', 'Stanley Park', 'Rent bikes, Seawall, Totem Poles, Brockton Point, Prospect Point'),
      s('Noon', 'Stanley Park', 'Lunch'),
      s('Afternoon', 'Capilano Suspension Bridge Park', 'Suspension Bridge, Treetops Adventure, Cliffwalk'),
      s('Evening', 'Grouse Mountain', 'Gondola, Mountain views, Vancouver skyline'),
      s('Evening', 'Grouse Mountain / Vancouver', 'Dinner', 'Grouse Mountain'),
      s('Evening', 'Hotel', 'Hotel'),
    ],
  },
  {
    date: 'Sep 14',
    stops: [
      s('Morning', 'Hotel', 'Breakfast'),
      s('Morning', 'Lighthouse Park', 'Forest trails, Lighthouse, Rocky coastline, Ocean/mountain views'),
      s('Noon', 'Lighthouse Park', 'Lunch'),
      s('Afternoon', 'Granville Island', 'Public Market, Shops, Waterfront'),
      s('Afternoon', 'Kitsilano Beach', ''),
      s('Evening', 'English Bay', 'Sunset / waterfront'),
      s('Evening', 'Vancouver', 'Dinner'),
      s('Evening', 'Hotel', 'Hotel + board games'),
    ],
  },
  {
    date: 'Sep 15',
    stops: [
      s('9:30 am', 'Hotel', 'Breakfast + check out'),
      s('Morning', 'White Rock', 'Pier, Beach, Waterfront, Photos'),
      s('Afternoon', 'Vancouver / Richmond', 'Lunch, then start toward Squamish', 'Richmond'),
      s('Afternoon', 'Shannon Falls', ''),
      s('Afternoon', 'Sea-to-Sky Highway', 'Continue Sea-to-Sky Highway'),
      s('5:30 pm', 'Whistler', 'Arrive + check in'),
      s('Evening', 'Whistler Village', 'Dinner'),
      s('Evening', 'Hotel', 'Hotel'),
    ],
  },
  {
    date: 'Sep 16',
    stops: [
      s('Morning', 'Hotel', 'Breakfast'),
      s('Morning', 'Joffre Lakes', 'Hike: Lower, Middle, Upper Lake, Glacier/mountain views'),
      s('Afternoon', 'Joffre Lakes', 'Lunch'),
      s('Afternoon', 'Whistler', 'Return to Whistler'),
      s('Evening', 'Hotel', 'Shower / rest'),
      s('Evening', 'Whistler Village', 'Dinner, relax'),
    ],
  },
  {
    date: 'Sep 17',
    stops: [
      s('Morning', 'Hotel', 'Breakfast'),
      s('10:00 am', 'Hotel', 'Check out'),
      s('Noon', 'Vancouver', 'Arrive Vancouver, lunch'),
      s('Afternoon', 'Vancouver', 'Final walk / coffee / shopping'),
      s('3:30 pm', 'Vancouver International Airport (YVR)', 'Arrive YVR', 'YVR'),
      s('5:00 pm', 'Vancouver International Airport (YVR)', 'Flight', 'YVR'),
    ],
  },
]
