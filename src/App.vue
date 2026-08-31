<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import seed from './itinerary.js'
import hotels from './hotels.js'

const KEY = 'van-trip'
const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
const days = ref(saved?.days ?? seed)
const places = ref(saved?.places ?? structuredClone(hotels)) // available locations, pending to drop into a day
const removed = ref(saved?.removed ?? []) // urls the user deleted, so the hotel merge below doesn't resurrect them
// merge any hotels added after first save (matched by url)
for (const h of hotels) { if (removed.value.includes(h.url)) continue; const p = places.value.find(p => p.url === h.url); p ? Object.assign(p, { kind: h.kind, note: h.note }) : places.value.push({ ...h }) }
const dayIdx = ref(0)
const day = computed(() => days.value[dayIdx.value] ?? { date: '', stops: [] }) // fallback keeps template alive when no days exist
const query = ref('')
const results = ref([])
const searching = ref(false)
const error = ref('')

watch([days, places, removed], () => localStorage.setItem(KEY, JSON.stringify({ days: days.value, places: places.value, removed: removed.value })), { deep: true })

// --- edits ---
const addStop = (stop) => day.value.stops.push({ place: 'New stop', lat: null, lng: null, ...stop })
const removeStop = (i) => day.value.stops.splice(i, 1)
const addDay = () => { days.value.push({ date: 'New day', stops: [] }); dayIdx.value = days.value.length - 1 }
const removeDay = (i) => { if (days.value.length > 1 && confirm(`Delete ${days.value[i].date}?`)) { days.value.splice(i, 1); dayIdx.value = Math.min(dayIdx.value, days.value.length - 1) } }
const reset = () => { if (confirm('Reset to the original itinerary? Available places are kept.')) days.value = structuredClone(seed) }
// CSV: Date,Time,Location,Activity,Note — day row has Date only; stop rows have Date blank
const exportCsv = () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Date', 'Time', 'Location', 'Activity', 'Note']]
  for (const d of days.value) {
    rows.push([d.date, '', '', '', ''])
    for (const s of d.stops) rows.push(['', s.time ?? '', s.place, s.activity ?? '', s.note ?? ''])
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' })),
    download: 'itinerary.csv',
  })
  a.click(); URL.revokeObjectURL(a.href)
}
const download = (name, text, type) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  a.click(); URL.revokeObjectURL(a.href)
}
// Full-state backup / restore
const exportJson = () => download('van-trip.json', JSON.stringify({ days: days.value, places: places.value, removed: removed.value }), 'application/json')
const importJson = async (e) => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  try {
    const j = JSON.parse(await f.text())
    if (!Array.isArray(j.days)) throw 0
    days.value = j.days; places.value = j.places ?? []; removed.value = j.removed ?? []; dayIdx.value = 0
  } catch { alert('Not a valid trip backup file') }
}
// Text itinerary: every destination per day + a Google Maps directions link per day (Maps caps waypoints ~10)
const exportList = () => {
  const text = days.value.map(d => {
    const pts = d.stops.filter(s => s.lat != null).slice(0, 10).map(s => `${s.lat},${s.lng}`)
    const url = pts.length > 1 ? `\nGoogle Maps: https://www.google.com/maps/dir/${pts.join('/')}` : ''
    return `${d.date}\n${d.stops.map((s, i) => `${i + 1}. ${s.place}${s.note ? ` — ${s.note}` : ''}`).join('\n')}${url}`
  }).join('\n\n')
  download('van-trip.txt', text, 'text/plain')
}
// KML for Google My Maps: import as a layer → one folder per day, numbered pins, route line
const exportKml = () => {
  const esc = (v) => String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
  const folders = days.value.map(d => {
    const pinned = d.stops.filter(s => s.lat != null)
    const marks = pinned.map((s, i) => `<Placemark><name>${i + 1}. ${esc(s.place)}</name><description>${esc(s.note)}</description><Point><coordinates>${s.lng},${s.lat},0</coordinates></Point></Placemark>`)
    const line = pinned.length > 1 ? `<Placemark><name>${esc(d.date)} route</name><styleUrl>#route</styleUrl><LineString><coordinates>${pinned.map(s => `${s.lng},${s.lat},0`).join(' ')}</coordinates></LineString></Placemark>` : ''
    return `<Folder><name>${esc(d.date)}</name>${marks.join('')}${line}</Folder>`
  })
  download('van-trip.kml', `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Van Trip</name><Style id="route"><LineStyle><color>ff3539e5</color><width>3</width></LineStyle></Style>${folders.join('')}</Document></kml>`, 'application/vnd.google-earth.kml+xml')
}
// Google Maps directions for the selected day (Maps caps waypoints ≈10; extra stops are dropped)
// Shortest-route sort: greedy nearest-neighbor from the first pinned stop.
// ponytail: straight-line km as travel-time proxy; swap in OSRM /table if real drive times matter
const dist = (a, b) => Math.hypot((a.lng - b.lng) * Math.cos((a.lat + b.lat) * Math.PI / 360), a.lat - b.lat)
const isStay = (p) => p.kind === 'stay' || /airbnb|hotel/i.test(p.place)
const kindOf = (s) => s.kind ?? places.value.find(p => p.place === s.place)?.kind ?? (isStay(s) ? 'stay' : undefined)
const optimize = () => {
  const s = day.value.stops, pinned = s.filter(p => p.lat != null)
  if (pinned.length < 3) return
  // stays (airbnb/hotel) anchor the day: keep one at the start if already first, the rest go to the end
  const start = isStay(pinned[0]) ? pinned.shift() : null
  const stays = pinned.filter(isStay), rest = pinned.filter(p => !isStay(p))
  if (!start && !rest.length) return
  const route = [start ?? rest.shift()]
  while (rest.length) {
    let k = 0
    for (let i = 1; i < rest.length; i++) if (dist(route.at(-1), rest[i]) < dist(route.at(-1), rest[k])) k = i
    route.push(...rest.splice(k, 1))
  }
  day.value.stops = [...route, ...stays, ...s.filter(p => p.lat == null)]
}
// ponytail: straight-line x1.3 road factor at 60 km/h; swap in OSRM /route if real ETAs matter
const transit = computed(() => {
  const p = day.value.stops.filter(s => s.lat != null)
  let km = 0
  for (let i = 1; i < p.length; i++) km += dist(p[i - 1], p[i]) * 111.32
  if (!km) return ''
  km *= 1.3
  const min = Math.round(km / 5) * 5, h = Math.floor(min / 60), m = min % 60
  return `≈ ${Math.round(km)} km · ~${h ? h + ' h ' : ''}${m ? m + ' min ' : ''}driving`
})
const savePlace = (r) => { removed.value = removed.value.filter(u => u !== r.url); if (!places.value.some(p => p.lat === r.lat && p.lng === r.lng)) places.value.push({ place: r.place, lat: r.lat, lng: r.lng, url: r.url, note: r.note, kind: r.kind }) }
const removePlace = (p) => { if (p.url) removed.value.push(p.url); places.value = places.value.filter(x => x.place !== p.place) }
// Available = union of all days' stops + manually saved places, deduped by name, grouped by region
const inTrip = (p) => days.value.some(d => d.stops.some(x => x.place === p.place))
const KINDS = { food: { label: 'Food', color: '#fb8c00', icon: '🍴' }, stay: { label: 'Stays', color: '#8e24aa', icon: '🛏' } }
const region = (p) => KINDS[p.kind]?.label ?? ((p.lat ?? 0) > 49.6 ? 'Whistler' : 'Vancouver')
const cycleKind = (p) => { if (ro) return; const ks = [undefined, ...Object.keys(KINDS)]; const k = ks[(ks.indexOf(p.kind) + 1) % ks.length]; for (const x of [...places.value, ...days.value.flatMap(d => d.stops)]) if (x.place === p.place) x.kind = k } // ponytail: lat split; add a region field if trip leaves BC
const available = computed(() => {
  const seen = new Map()
  for (const p of [...days.value.flatMap(d => d.stops), ...places.value]) if (!seen.has(p.place)) seen.set(p.place, { place: p.place, lat: p.lat, lng: p.lng, url: p.url, note: p.note, kind: p.kind })
  const groups = { Vancouver: [], Whistler: [], Food: [], Stays: [] }
  for (const p of seen.values()) groups[region(p)].push(p)
  for (const g of Object.values(groups)) g.sort((a, b) => a.place.localeCompare(b.place))
  return groups
})

// --- drag & drop: within day (reorder), lib -> day (copy in), day -> lib (move out) ---
const drag = ref(null) // { src: 'day', i } | { src: 'lib', item } | { src: 'days', i }
const dropOnDays = (to) => {
  const d = drag.value; drag.value = null
  if (d?.src !== 'days' || d.i === to) return
  const cur = days.value[dayIdx.value]
  const [item] = days.value.splice(d.i, 1)
  days.value.splice(to, 0, item)
  dayIdx.value = days.value.indexOf(cur)
}
const dropOnDay = (to = day.value.stops.length) => {
  const d = drag.value; drag.value = null
  if (!d) return
  const s = day.value.stops
  if (d.src === 'day') {
    if (d.i === to) return
    const [item] = s.splice(d.i, 1)
    s.splice(to > d.i ? to - 1 : to, 0, item)
  } else {
    s.splice(to, 0, { ...d.item })
  }
}
const dropOnLib = () => {
  const d = drag.value; drag.value = null
  if (d?.src !== 'day') return
  savePlace(day.value.stops[d.i]); removeStop(d.i) // stays in Available via union or saved places
}

// --- Leaflet + OpenStreetMap ---
let map, polyline, layer, resultLayer, otherLayer
const mapEl = ref(null)
const numIcon = (n, cls = 'pin', color) => L.divIcon({ className: cls, html: `<span${color ? ` style="background:${color}"` : ''}>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })

onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: false, doubleClickZoom: false }).setView([49.28, -123.12], 10)
  L.control.zoom({ position: 'topright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  map.on('dblclick', (e) => { if (!ro) addStop({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  layer = L.layerGroup().addTo(map)
  otherLayer = L.layerGroup().addTo(map)
  resultLayer = L.layerGroup().addTo(map)
  polyline = L.polyline([], { color: '#e53935', weight: 3 }).addTo(map)
  watch([day, available], render, { deep: true, immediate: true })
  watch(dayIdx, panToDay, { immediate: true })
})

// Two fixed views; pick by where most of the day's stops are
const VIEWS = { Vancouver: [[49.22, -123.18], 11], Whistler: [[50.0, -122.9], 10] }
function panToDay() {
  const n = day.value.stops.filter(p => p.lat != null && region(p) === 'Whistler').length
  const [c, z] = VIEWS[n * 2 > day.value.stops.length ? 'Whistler' : 'Vancouver']
  map.setView(c, z)
}

function render() {
  if (!map) return
  layer.clearLayers()
  const path = []
  day.value.stops.forEach((s, i) => {
    if (s.lat == null) return
    const m = L.marker([s.lat, s.lng], { icon: numIcon(i + 1, 'pin', KINDS[kindOf(s)]?.color), title: s.place, draggable: !ro }).addTo(layer)
    m.on('dragend', (e) => { const p = e.target.getLatLng(); s.lat = p.lat; s.lng = p.lng })
    m.on('click', () => focus(s))
    m.on('dblclick', () => { if (!ro && confirm(`Remove pin "${s.place}"?`)) removeStop(i) })
    path.push([s.lat, s.lng])
  })
  polyline.setLatLngs(path)
  otherLayer.clearLayers()
  for (const p of Object.values(available.value).flat()) {
    if (p.lat == null || inTrip(p)) continue
    L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: KINDS[p.kind]?.color ?? '#757575', fillOpacity: .9 })
      .bindTooltip(p.place).on('click', () => ro ? focus(p) : addStop({ ...p })).addTo(otherLayer)
  }
}

// Nominatim (OSM) search. ponytail: public endpoint, ~1 req/s limit; self-host or use Photon if it throttles.
async function search(text = query.value) {
  if (!text.trim()) return
  searching.value = true; error.value = ''
  try {
    const b = map.getBounds()
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(text)}&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`
    const found = await (await fetch(url)).json()
    results.value = found.map(p => ({ place: p.name || p.display_name.split(',')[0], address: p.display_name, lat: +p.lat, lng: +p.lon }))
    if (!results.value.length) error.value = 'No results'
    showResults()
  } catch (e) { error.value = e.message }
  searching.value = false
}
const letter = (i) => String.fromCharCode(65 + i)
function showResults() {
  resultLayer.clearLayers()
  const pts = results.value.map((r, i) => {
    L.marker([r.lat, r.lng], { icon: numIcon(letter(i), 'pin result'), title: r.place }).addTo(resultLayer)
    return [r.lat, r.lng]
  })
  if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 14 })
}
const clear = () => { results.value = []; query.value = ''; resultLayer.clearLayers() }
const pickDay = (r) => { addStop({ place: r.place, lat: r.lat, lng: r.lng }); clear() }
const pickLib = (r) => { savePlace(r); clear() }
async function locate(s) {
  await search(s.place)
  const r = results.value[0]
  if (r) { s.lat = r.lat; s.lng = r.lng }
  clear()
}
// ponytail: mobile = read-only viewer (import only); checked once at load, not on rotate
const ro = matchMedia('(max-width: 800px)').matches
const edit = (e) => { if (ro) return; e.target.contentEditable = true; e.target.focus() }
// mobile stop carousel
const stopIdx = ref(0)
const availOpen = ref(false)
const sheetUp = ref(false)
const gmapLink = (s) => 'https://www.google.com/maps/search/?api=1&query=' + (s.lat != null ? `${s.lat},${s.lng}` : encodeURIComponent(s.place))
const copyName = () => navigator.clipboard?.writeText(curStop.value.place)
// bottom sheet follows the finger: dragY is the live delta, list height tracks it, snap on release
const dragY = ref(null)
let ty = 0
const maxH = () => window.innerHeight * 0.55
const clampH = () => Math.min(maxH(), Math.max(0, (sheetUp.value ? maxH() : 0) - dragY.value))
const tstart = (e) => { ty = e.touches[0].clientY; dragY.value = 0 }
const tmove = (e) => { dragY.value = e.touches[0].clientY - ty }
const tend = (e) => {
  if (Math.abs(dragY.value) < 10) { if (e.target.classList.contains('handle')) sheetUp.value = !sheetUp.value }
  else sheetUp.value = clampH() > maxH() / 2
  dragY.value = null
}
const sheetStyle = computed(() => {
  if (!ro) return null
  const h = dragY.value == null ? (sheetUp.value ? maxH() : 0) : clampH()
  return { height: h + 'px', transition: dragY.value == null ? 'height .25s' : 'none', overflowY: 'auto' }
})
const curStop = computed(() => day.value.stops[Math.min(stopIdx.value, day.value.stops.length - 1)])
const step = (d) => {
  const n = day.value.stops.length
  if (!n) return
  stopIdx.value = (day.value.stops.indexOf(curStop.value) + d + n) % n
  focus(day.value.stops[stopIdx.value])
}
watch(dayIdx, () => { stopIdx.value = 0 })
// ponytail: photos best-effort from Wikipedia page summaries; many POIs simply have none
const photo = ref('')
watch(curStop, async (s) => {
  photo.value = ''
  if (!s?.place) return
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.place)}`)
    const t = r.ok ? (await r.json()).thumbnail?.source : ''
    if (curStop.value?.place === s.place) photo.value = t ?? ''
  } catch {}
}, { immediate: true })
const focus = (s) => {
  if (s.lat != null && map) map.setView([s.lat, s.lng], 14)
  const i = day.value.stops.findIndex(x => x.place === s.place)
  if (i >= 0) stopIdx.value = i
  availOpen.value = false
}
</script>

<template>
  <div class="app">
    <nav class="days">
      <h3>Days</h3>
      <select class="mobile-only" :value="dayIdx" @change="dayIdx = +$event.target.value">
        <option v-for="(d, i) in days" :key="i" :value="i">{{ d.date }}</option>
      </select>
      <ul>
        <li v-for="(d, i) in days" :key="i" :class="{ active: i === dayIdx }" @click="dayIdx = i"
            draggable="true" @dragstart="drag = { src: 'days', i }" @dragend="drag = null" @dragover.prevent @drop="dropOnDays(i)">
          <span class="name" @dblclick="edit" @blur="d.date = $event.target.textContent.trim() || d.date; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ d.date }}</span>
          <button @click.stop="edit({ target: $event.target.previousElementSibling })" title="Rename">✎</button>
          <button @click.stop="removeDay(i)" title="Delete day">✕</button>
        </li>
      </ul>
      <button class="edit" @click="addDay">+ day</button>
      <details class="tools">
        <summary>⚙ tools</summary>
        <div class="menu" @click="$event.currentTarget.parentElement.open = false">
          <button class="edit" @click="reset" title="Reset itinerary">↺ reset</button>
          <button @click="exportCsv" title="Download itinerary as CSV">⬇ CSV</button>
          <button @click="exportKml" title="Download KML — import into Google My Maps (mymaps.google.com → Create → Import)">⬇ KML</button>
          <button @click="exportList" title="Download all destinations as text with a Google Maps route link per day">⬇ list</button>
          <button @click="exportJson" title="Backup the whole trip as JSON">⬇ export</button>
          <button @click="$refs.file.click()" title="Restore a trip from a JSON backup">⬆ import</button>
        </div>
      </details>
      <input ref="file" type="file" accept="application/json,.json" hidden @change="importJson" />
    </nav>

    <main class="center">
      <div ref="mapEl" class="map"></div>
      <button v-if="!availOpen" class="mobile-only availbtn" @click="availOpen = true" title="Show places">▸</button>
      <div class="searchbox">
        <p v-if="error" class="err">{{ error }}</p>
        <ul v-if="results.length" class="results">
          <li v-for="(r, i) in results" :key="r.lat + r.lng" @click="focus(r)">
            <span class="n result">{{ letter(i) }}</span>
            <div><b>{{ r.place }}</b><br /><small>{{ r.address }}</small></div>
            <button class="edit" @click.stop="pickDay(r)" title="Add to this day">+ day</button>
            <button class="edit" @click.stop="pickLib(r)" title="Add to available">+ available</button>
            <button class="edit" @click.stop="pickLib({ ...r, kind: 'food' })" title="Add as food">+ 🍴</button>
          </li>
        </ul>
        <form @submit.prevent="search()">
          <input v-model="query" placeholder="Search a place…" />
          <button :disabled="searching">{{ searching ? '…' : 'Search' }}</button>
          <button v-if="results.length" type="button" @click="clear">✕</button>
        </form>
      </div>
    </main>

    <div v-if="!days.length" class="welcome">
      <div class="box">
        <h3>Start your trip</h3>
        <p>No trip data yet. Import a saved trip, or start a new one.</p>
        <button @click="$refs.file.click()">⬆ import trip JSON</button>
        <button class="edit" @click="addDay">+ add a first day</button>
      </div>
    </div>

    <aside class="right" :class="{ up: sheetUp }">
      <div class="handle mobile-only" @touchstart="tstart" @touchmove="tmove" @touchend="tend"></div>
      <div v-if="day.stops.length" class="stopcard mobile-only" @touchstart="tstart" @touchmove="tmove" @touchend="tend">
        <button @click="step(-1)" title="Previous stop">‹</button>
        <div class="cur" @click="focus(curStop)">
          <b>{{ day.stops.indexOf(curStop) + 1 }}/{{ day.stops.length }} · {{ curStop.place }}</b>
          <small v-if="curStop.note">{{ curStop.note }}</small>
          <img v-if="photo" :src="photo" class="photo" alt="" />
          <div class="acts">
            <a :href="gmapLink(curStop)" target="_blank" rel="noopener" @click.stop>🗺 Maps</a>
            <a v-if="curStop.url" :href="curStop.url" target="_blank" rel="noopener" @click.stop>🔗 listing</a>
            <button @click.stop="copyName">⧉ copy name</button>
          </div>
        </div>
        <button @click="step(1)" title="Next stop">›</button>
      </div>
      <section class="col" :style="sheetStyle" @dragover.prevent @drop="dropOnDay()">
        <h3>{{ day.date }} <button class="edit" @click="optimize" title="Sort stops into the shortest route (keeps the first stop as start)">🧭</button></h3>
        <p v-if="transit" class="hint transit">{{ transit }}</p>
        <ol>
          <li v-for="(s, i) in day.stops" :key="i" :class="{ nopin: s.lat == null }"
              draggable="true" @dragstart="drag = { src: 'day', i }" @dragend="drag = null"
              @dragover.prevent @drop.stop="dropOnDay(i)">
            <span class="n" :style="s.lat != null && KINDS[kindOf(s)] ? { background: KINDS[kindOf(s)].color } : null" @click="focus(s)" title="Click to focus">{{ i + 1 }}</span>
            <span class="name" @dblclick="edit" @blur="s.place = $event.target.textContent.trim() || s.place; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ s.place }}</span>
            <button v-if="s.lat == null" class="edit" @click="locate(s)" title="Find on map">🔍</button>
            <button v-else @click="focus(s)" title="Go to place on map">📍</button>
            <button class="edit" @click="removeStop(i)">✕</button>
          </li>
        </ol>
        <p class="hint edit">Double-click a name to rename · Drag to reorder · drop available places here · double-click map or click a grey dot to add</p>
      </section>

      <div v-if="availOpen" class="mobile-only backdrop" @click="availOpen = false"></div>
      <section class="col avail" :class="{ collapsed: !availOpen }" @dragover.prevent @drop="dropOnLib">
        <h3>Available <button class="mobile-only" @click="availOpen = false">✕</button></h3>
        <template v-for="(list, name) in available" :key="name">
          <h4 v-if="list.length">{{ name }}</h4>
          <ul>
            <li v-for="p in list" :key="p.place" :class="{ dim: inTrip(p) }" draggable="true" @dragstart="drag = { src: 'lib', item: p }" @dragend="drag = null">
              <span class="n lib" :style="KINDS[p.kind] && { background: KINDS[p.kind].color }" @click="cycleKind(p)" title="Click to change type">{{ KINDS[p.kind]?.icon ?? '●' }}</span>
              <span class="name" @click="focus(p)" @dblclick="edit" @blur="p.place = $event.target.textContent.trim() || p.place; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ p.place }}<small v-if="p.note"> {{ p.note }}</small></span>
              <a v-if="p.url" :href="p.url" target="_blank" rel="noopener" title="Open listing" @click.stop>🔗</a>
              <button v-if="!inTrip(p)" class="edit" @click="removePlace(p)">✕</button>
            </li>
          </ul>
        </template>
        <p class="hint edit">All trip locations · dimmed = already in the trip · drag into the day column · click badge to change type</p>
      </section>
    </aside>
  </div>
</template>

<style>
* { box-sizing: border-box }
body { margin: 0; font: 14px system-ui, sans-serif }
h3 { margin: 0 0 8px; font-size: 14px }
ul, ol { list-style: none; margin: 0; padding: 0 }
input { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; min-width: 0; flex: 1 }
button { cursor: pointer; padding: 3px 7px; border: 1px solid #bbb; border-radius: 4px; background: #f6f6f6 }
button:disabled { opacity: .4; cursor: default }
.err { color: #c00; margin: 0 0 4px; background: #fff; padding: 4px 8px; border-radius: 4px }
.name { flex: 1; padding: 4px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: inherit }
.name small { color: #888; font-size: 11px }
.col li a { text-decoration: none; font-size: 12px }
.col h3 a { font-weight: 400; font-size: 12px; margin-left: 6px }
.name[contenteditable=true] { outline: 2px solid #1976d2; border-radius: 4px; background: #fff; white-space: normal }
.hint { color: #888; font-size: 12px; margin: 8px 0 0 }

.welcome { position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center }
.welcome .box { background: #fff; border-radius: 10px; padding: 20px 24px; box-shadow: 0 4px 24px rgba(0,0,0,.35); display: flex; flex-direction: column; gap: 10px; text-align: center; max-width: 90vw }
.welcome p { margin: 0; color: #666; font-size: 13px }
.welcome button { padding: 8px 12px }
.tools { position: relative }
.tools summary { list-style: none; display: inline-block; cursor: pointer; padding: 3px 7px; border: 1px solid #bbb; border-radius: 4px; background: #f6f6f6 }
.tools summary::-webkit-details-marker { display: none }
.tools .menu { position: fixed; margin-top: 4px; z-index: 2000; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: #fff; border: 1px solid #ccc; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.2); min-width: 140px }
.tools .menu button { text-align: left }
.app { display: grid; grid-template-columns: 180px 1fr 480px; height: 100vh }
.days { padding: 10px; border-right: 1px solid #ddd; overflow-y: auto; display: flex; flex-direction: column; gap: 6px }
.days li { display: flex; gap: 4px; padding: 4px; border-radius: 4px; cursor: grab }
.days li.active { background: #e53935; color: #fff }
.days li.active input { font-weight: 600 }
.center { position: relative }
.map { position: absolute; inset: 0 }
.searchbox { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); width: min(560px, 90%); z-index: 1000 }
.searchbox form { display: flex; gap: 4px; background: #fff; padding: 6px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.3) }
.results { background: #fff; border-radius: 8px; margin-bottom: 6px; box-shadow: 0 2px 12px rgba(0,0,0,.3); max-height: 40vh; overflow-y: auto }
.results li { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid #eee }
.results li div { flex: 1 }
.right { display: grid; grid-template-columns: 1fr 1fr; border-left: 1px solid #ddd; overflow: hidden }
.col { padding: 10px; overflow-y: auto; min-height: 0 }
.col + .col { border-left: 1px solid #ddd; background: #fafafa }
.col li { display: flex; gap: 4px; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee; cursor: grab }
.n { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #e53935; color: #fff; text-align: center; line-height: 22px; font-size: 12px; cursor: pointer }
.nopin .n { background: #999 }
.col h4 { margin: 10px 0 4px; font-size: 12px; color: #666; text-transform: uppercase }
.col li.dim { opacity: .4 }
.n.lib, .n.result, .pin.result span { background: #1976d2 }
.n.lib { font-size: 11px }
.results li { cursor: pointer }
/* mobile: stack — day strip on top, map, then lists; page scrolls */
.mobile-only { display: none }
.handle { display: none }
@media (max-width: 800px) {
  .app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: 100vh }
  .days ul { display: none }
  .edit { display: none !important }
  button.mobile-only { display: inline-block }
  select.mobile-only { display: block; flex: 1; padding: 6px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 14px }
  .searchbox { display: none }
  .backdrop.mobile-only { display: block; position: fixed; inset: 0; z-index: 2999; background: rgba(0,0,0,.25) }
  .availbtn { position: absolute; left: 10px; top: 10px; z-index: 1001; font-size: 16px; padding: 6px 10px }
  .col.avail { padding-top: 0 }
  .avail h3 { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; background: #fafafa; margin: 0 -10px 8px; padding: 10px; border-bottom: 1px solid #ddd }
  .col.avail { position: fixed; left: 0; top: 0; bottom: 0; width: min(80vw, 320px); z-index: 3000; background: #fafafa; box-shadow: 2px 0 12px rgba(0,0,0,.3); transition: transform .25s; overflow-y: auto }
  .avail.collapsed { transform: translateX(-100%); box-shadow: none }
  .stopcard.mobile-only { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #ddd; background: #fff }
  .stopcard .cur { flex: 1; min-width: 0; text-align: center; overflow: hidden }
  .stopcard .cur small { display: block; color: #888 }
  .stopcard .photo { width: 100%; max-height: 140px; object-fit: cover; border-radius: 8px; margin-top: 6px }
  .stopcard .acts { display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 6px }
  .stopcard .acts a { text-decoration: none; font-size: 13px }
  .stopcard .acts button { font-size: 13px; padding: 4px 8px }
  .stopcard button { font-size: 18px; padding: 4px 14px }
  .days { flex-direction: row; flex-wrap: wrap; align-items: center; border-right: 0; border-bottom: 1px solid #ddd }
  .days h3 { display: none }
  .right { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 1500; border-left: 0; background: #fff; border-radius: 12px 12px 0 0; box-shadow: 0 -2px 12px rgba(0,0,0,.25) }
  .right .col:not(.avail) { padding-top: 0; padding-bottom: 0 }
  .handle { display: block; width: 44px; height: 5px; border-radius: 3px; background: #ccc; margin: 8px auto }
  .col { overflow: visible }
  .col + .col { border-left: 0; border-top: 1px solid #ddd }
  button { padding: 6px 10px }
}
.pin span { display: block; width: 26px; height: 26px; border-radius: 50%; background: #e53935; color: #fff; text-align: center; line-height: 26px; font: bold 12px system-ui; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); box-sizing: border-box }
</style>
