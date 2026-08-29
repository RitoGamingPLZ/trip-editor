// Airbnb wishlist (Sep 12–15, 4 adults). Coords are neighbourhood centers — Airbnb hides exact addresses.
const h = (place, lat, lng, price, rating, id) => ({ place, lat, lng, kind: 'stay', url: `https://www.airbnb.com/rooms/${id}`, note: `$${price} CAD · ★${rating}` })

export default [
  h('Spacious East Van Retreat · 20 min to BC Place', 49.262, -123.07, 920, '5.0', '1658454242852365846'),
  h('Budget Spacious Full Home · Main & Upper Floors', 49.25, -123.10, 909, '4.27', '1649982345249110511'),
  h('Modern North Van Escape 2BR · BBQ · Workspace', 49.32, -123.07, 904, '5.0', '1683633511257319268'),
  h('Northwest Hideaway Suite (Burnaby)', 49.25, -122.98, 859, '4.96', '45497219'),
  h('Modern Vancouver Home · Self Check-In', 49.24, -123.09, 1022, '4.83', '723174972783640817'),
  h('Burqui Garden Home (Coquitlam)', 49.28, -122.79, 867, '5.0', '1698758234383177633'),
  h('Vancouver 3-Bed House with Parking · Sleeps 8', 49.23, -123.06, 987, '4.63', '959642591351932111'),
  h('Luxury 2BR Retreat in Kerrisdale', 49.23, -123.16, 1192, '4.89', '1235145273246973066'),
  h('Nature Haven Retreat (North Vancouver)', 49.33, -123.05, 1021, '5.0', '1713148051068655826'),
  h('Edgemont Retreat · Family House (North Vancouver)', 49.34, -123.10, 977, '4.75', '1710421663702356330'),
]
