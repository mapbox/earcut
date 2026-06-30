import earcut, {flatten, deviation, refine} from '../src/earcut.js';

const params = new URLSearchParams(window.location.search.substring(1));
const rotation = +(params.get('rotation') || 0);

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const area = document.getElementById('canvas-area');
const fixturesEl = document.getElementById('fixtures');
const refineEl = document.getElementById('refine');
const statsEl = document.getElementById('stats');

let current = params.get('fixture') || 'water';
let state = null; // computed data for the current fixture, reused across redraws/toggles

// build the fixture list from the names in expected.json
const expected = await (await fetch('../test/expected.json')).json();
for (const name of Object.keys(expected.triangles)) {
    const li = document.createElement('li');
    li.textContent = name;
    li.dataset.name = name;
    fixturesEl.appendChild(li);
}
fixturesEl.onclick = (e) => {
    if (!e.target.dataset.name) return;
    current = e.target.dataset.name;
    select();
};

refineEl.checked = params.get('refine') === '1';
refineEl.onchange = update;
addEventListener('resize', draw);

select();

function select() {
    for (const li of fixturesEl.children) li.classList.toggle('active', li.dataset.name === current);
    const url = new URL(location);
    url.searchParams.set('fixture', current);
    history.replaceState(null, '', url);
    load();
}

// load + triangulate the current fixture from scratch (base triangulation only)
async function load() {
    const rings = rotate(await (await fetch(`../test/fixtures/${current}.json`)).json(), rotation);
    const data = flatten(rings);

    const base = earcut(data.vertices, data.holes, data.dimensions);
    const baseTime = bench(() => earcut(data.vertices, data.holes, data.dimensions));

    state = {
        rings, data, base, baseTime,
        refined: null, refineTime: 0,
        deviation: deviation(data.vertices, data.holes, data.dimensions, base),
        bounds: ringBounds(rings[0]),
        paths: null // {key, outline, base, refined} — cached Path2Ds, rebuilt on resize
    };
    update();
}

// refine on demand and cache it, so toggling back and forth is instant
function update() {
    if (refineEl.checked && !state.refined) {
        const {vertices, dimensions} = state.data;
        state.refined = state.base.slice();
        refine(state.refined, vertices, dimensions);
        // re-refine fresh copies of the base triangulation to time it in isolation
        state.refineTime = bench(() => refine(state.base.slice(), vertices, dimensions));
    }
    drawStats();
    draw();
}

function rotate(rings, deg) {
    if (!deg) return rings;
    const theta = deg * Math.PI / 180;
    const round = deg % 90 === 0 ? Math.round : x => x;
    const xx = round(Math.cos(theta)), xy = round(-Math.sin(theta));
    const yx = round(Math.sin(theta)), yy = round(Math.cos(theta));
    return rings.map(ring => ring.map(([x, y]) => [xx * x + xy * y, yx * x + yy * y]));
}

function ringBounds(ring) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return {minX, minY, w: maxX - minX, h: maxY - minY};
}

function draw() {
    if (!state) return;
    const pad = 10;
    const W = area.clientWidth, H = area.clientHeight;
    const {minX, minY, w, h} = state.bounds;
    const scale = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    // center within the canvas area
    const ox = (W - w * scale) / 2, oy = (H - h * scale) / 2;

    // (re)build the Path2Ds only when the projection changes; toggling refine then just rasterizes
    const key = `${W}x${H}`;
    if (!state.paths || state.paths.key !== key) state.paths = {key};
    const paths = state.paths;
    const which = refineEl.checked ? 'refined' : 'base';
    const px = x => (x - minX) * scale + ox;
    const py = y => (y - minY) * scale + oy;

    if (!paths[which]) {
        const p = new Path2D();
        const result = refineEl.checked ? state.refined : state.base;
        const dim = state.data.dimensions, v = state.data.vertices;
        for (let i = 0; i < result.length; i += 3) {
            const a = result[i], b = result[i + 1], c = result[i + 2];
            p.moveTo(px(v[a * dim]), py(v[a * dim + 1]));
            p.lineTo(px(v[b * dim]), py(v[b * dim + 1]));
            p.lineTo(px(v[c * dim]), py(v[c * dim + 1]));
            p.closePath();
        }
        paths[which] = p;
    }
    if (!paths.outline) {
        const p = new Path2D();
        for (const ring of state.rings) {
            ring.forEach(([x, y], i) => i ? p.lineTo(px(x), py(y)) : p.moveTo(px(x), py(y)));
            p.closePath();
        }
        paths.outline = p;
    }

    const dpr = devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';

    ctx.fillStyle = 'rgba(255,255,0,0.2)';
    ctx.strokeStyle = 'rgba(255,0,0,0.4)';
    ctx.fill(paths[which]);
    ctx.stroke(paths[which]);

    ctx.strokeStyle = 'black';
    ctx.stroke(paths.outline);
}

// performance.now() is clamped to ~100µs in browsers, so a single run of a fast fixture
// reads 0; repeat until we've accumulated enough wall time and return the mean per run
function bench(fn) {
    fn(); // warm up
    let runs = 0;
    const start = performance.now();
    while (performance.now() - start < 20 && runs < 100000) {
        fn();
        runs++;
    }
    return (performance.now() - start) / runs;
}

// ~3 significant figures across scales
function ms(t) {
    const digits = t >= 100 ? 0 : t >= 10 ? 1 : t >= 1 ? 2 : t >= 0.1 ? 3 : 4;
    return `${t.toFixed(digits)} ms`;
}

function drawStats() {
    const result = refineEl.checked ? state.refined : state.base;
    const row = (label, value) => `<div><span class="label">${label}</span><span>${value}</span></div>`;
    statsEl.innerHTML =
        row('vertices', (state.data.vertices.length / state.data.dimensions).toLocaleString()) +
        row('triangles', (result.length / 3).toLocaleString()) +
        row('earcut', ms(state.baseTime)) +
        row('refine', refineEl.checked ? ms(state.refineTime) : '–') +
        row('deviation', state.deviation ? state.deviation.toExponential(2) : '0');
}
