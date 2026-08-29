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
// merge any hotels added after first save (matched by url)
for (const h of hotels) { const p = places.value.find(p => p.url === h.url); p ? Object.assign(p, { kind: h.kind, note: h.note }) : places.value.push({ ...h }) }
const dayIdx = ref(0)
const day = computed(() => days.value[dayIdx.value])
const query = ref('')
const results = ref([])
const searching = ref(false)
const error = ref('')

watch([days, places], () => localStorage.setItem(KEY, JSON.stringify({ days: days.value, places: places.value })), { deep: true })

// --- edits ---
const addStop = (stop) => day.value.stops.push({ place: 'New stop', lat: null, lng: null, ...stop })
const removeStop = (i) => day.value.stops.splice(i, 1)
const addDay = () => { days.value.push({ date: 'New day', stops: [] }); dayIdx.value = days.value.length - 1 }
const removeDay = (i) => { if (days.value.length > 1 && confirm(`Delete ${days.value[i].date}?`)) { days.value.splice(i, 1); dayIdx.value = Math.min(dayIdx.value, days.value.length - 1) } }
const reset = () => { if (confirm('Reset to the original itinerary? Available places are kept.')) days.value = structuredClone(seed) }
const savePlace = (r) => { if (!places.value.some(p => p.lat === r.lat && p.lng === r.lng)) places.value.push({ place: r.place, lat: r.lat, lng: r.lng, url: r.url, note: r.note, kind: r.kind }) }
const removePlace = (p) => { places.value = places.value.filter(x => x.place !== p.place) }
// Available = union of all days' stops + manually saved places, deduped by name, grouped by region
const inTrip = (p) => days.value.some(d => d.stops.some(x => x.place === p.place))
const KINDS = { food: { label: 'Food', color: '#fb8c00', icon: '🍴' }, stay: { label: 'Stays', color: '#8e24aa', icon: '🛏' } }
const region = (p) => KINDS[p.kind]?.label ?? ((p.lat ?? 0) > 49.6 ? 'Whistler' : 'Vancouver')
const cycleKind = (p) => { const ks = [undefined, ...Object.keys(KINDS)]; const k = ks[(ks.indexOf(p.kind) + 1) % ks.length]; for (const x of places.value) if (x.place === p.place) x.kind = k } // ponytail: lat split; add a region field if trip leaves BC
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
const numIcon = (n, cls = 'pin') => L.divIcon({ className: cls, html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })

onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: false }).setView([49.28, -123.12], 10)
  L.control.zoom({ position: 'topright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  map.on('click', (e) => addStop({ lat: e.latlng.lat, lng: e.latlng.lng }))
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
    const m = L.marker([s.lat, s.lng], { icon: numIcon(i + 1), title: s.place, draggable: true }).addTo(layer)
    m.on('dragend', (e) => { const p = e.target.getLatLng(); s.lat = p.lat; s.lng = p.lng })
    m.on('click', () => { if (confirm(`Remove pin "${s.place}"?`)) removeStop(i) })
    path.push([s.lat, s.lng])
  })
  polyline.setLatLngs(path)
  otherLayer.clearLayers()
  for (const p of Object.values(available.value).flat()) {
    if (p.lat == null || inTrip(p)) continue
    L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: KINDS[p.kind]?.color ?? '#757575', fillOpacity: .9 })
      .bindTooltip(p.place).on('click', () => addStop({ ...p })).addTo(otherLayer)
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
const edit = (e) => { e.target.contentEditable = true; e.target.focus() }
const focus = (s) => { if (s.lat != null && map) map.setView([s.lat, s.lng], 14) }
</script>

<template>
  <div class="app">
    <nav class="days">
      <h3>Days</h3>
      <ul>
        <li v-for="(d, i) in days" :key="i" :class="{ active: i === dayIdx }" @click="dayIdx = i"
            draggable="true" @dragstart="drag = { src: 'days', i }" @dragend="drag = null" @dragover.prevent @drop="dropOnDays(i)">
          <span class="name" @dblclick="edit" @blur="d.date = $event.target.textContent.trim() || d.date; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ d.date }}</span>
          <button @click.stop="edit({ target: $event.target.previousElementSibling })" title="Rename">✎</button>
          <button @click.stop="removeDay(i)" title="Delete day">✕</button>
        </li>
      </ul>
      <button @click="addDay">+ day</button>
      <button @click="reset" title="Reset itinerary">↺ reset</button>
    </nav>

    <main class="center">
      <div ref="mapEl" class="map"></div>
      <div class="searchbox">
        <p v-if="error" class="err">{{ error }}</p>
        <ul v-if="results.length" class="results">
          <li v-for="(r, i) in results" :key="r.lat + r.lng" @click="focus(r)">
            <span class="n result">{{ letter(i) }}</span>
            <div><b>{{ r.place }}</b><br /><small>{{ r.address }}</small></div>
            <button @click.stop="pickDay(r)" title="Add to this day">+ day</button>
            <button @click.stop="pickLib(r)" title="Add to available">+ available</button>
            <button @click.stop="pickLib({ ...r, kind: 'food' })" title="Add as food">+ 🍴</button>
          </li>
        </ul>
        <form @submit.prevent="search()">
          <input v-model="query" placeholder="Search a place…" />
          <button :disabled="searching">{{ searching ? '…' : 'Search' }}</button>
          <button v-if="results.length" type="button" @click="clear">✕</button>
        </form>
      </div>
    </main>

    <aside class="right">
      <section class="col" @dragover.prevent @drop="dropOnDay()">
        <h3>{{ day.date }}</h3>
        <ol>
          <li v-for="(s, i) in day.stops" :key="i" :class="{ nopin: s.lat == null }"
              draggable="true" @dragstart="drag = { src: 'day', i }" @dragend="drag = null"
              @dragover.prevent @drop.stop="dropOnDay(i)">
            <span class="n" @click="focus(s)" title="Click to focus">{{ i + 1 }}</span>
            <span class="name" @dblclick="edit" @blur="s.place = $event.target.textContent.trim() || s.place; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ s.place }}</span>
            <button v-if="s.lat == null" @click="locate(s)" title="Find on map">📍</button>
            <button @click="removeStop(i)">✕</button>
          </li>
        </ol>
        <p class="hint">Double-click a name to rename · Drag to reorder · drop available places here · click map or a grey dot to add</p>
      </section>

      <section class="col" @dragover.prevent @drop="dropOnLib">
        <h3>Available</h3>
        <template v-for="(list, name) in available" :key="name">
          <h4 v-if="list.length">{{ name }}</h4>
          <ul>
            <li v-for="p in list" :key="p.place" :class="{ dim: inTrip(p) }" draggable="true" @dragstart="drag = { src: 'lib', item: p }" @dragend="drag = null">
              <span class="n lib" :style="KINDS[p.kind] && { background: KINDS[p.kind].color }" @click="cycleKind(p)" title="Click to change type">{{ KINDS[p.kind]?.icon ?? '●' }}</span>
              <span class="name" @dblclick="edit" @blur="p.place = $event.target.textContent.trim() || p.place; $event.target.contentEditable = false" @keydown.enter.prevent="$event.target.blur()">{{ p.place }}<small v-if="p.note"> {{ p.note }}</small></span>
              <a v-if="p.url" :href="p.url" target="_blank" rel="noopener" title="Open listing" @click.stop>🔗</a>
              <button v-if="!inTrip(p)" @click="removePlace(p)">✕</button>
            </li>
          </ul>
        </template>
        <p class="hint">All trip locations · dimmed = already in the trip · drag into the day column · click badge to change type</p>
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
.name[contenteditable=true] { outline: 2px solid #1976d2; border-radius: 4px; background: #fff; white-space: normal }
.hint { color: #888; font-size: 12px; margin: 8px 0 0 }

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
.pin span { display: block; width: 26px; height: 26px; border-radius: 50%; background: #e53935; color: #fff; text-align: center; line-height: 26px; font: bold 12px system-ui; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); box-sizing: border-box }
</style>
